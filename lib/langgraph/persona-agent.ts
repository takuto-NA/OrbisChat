/**
 * PersonaAgent - ペルソナエージェントの思考と応答生成を管理するLangGraphベースのエージェント
 * 
 * このファイルは、各ペルソナが会話の文脈を理解し、適切なタイミングで応答を生成するための
 * ステートマシン（LangGraph）を実装しています。思考プロセス、競合チェック、応答決定、
 * 応答生成の各ステップを順次実行し、ペルソナの個性に基づいた自律的な会話参加を実現します。
 */

import { StateGraph, END, START } from '@langchain/langgraph/web';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { db, Persona, Message, ThoughtLog, Settings } from '../db';
import { logger } from '../logger';
import { apiQueue } from '../api-queue';
import { turnTakingManager } from '../turn-taking';
import {
  DEFAULT_TEMPERATURE_FOR_THINKING,
  DEFAULT_TEMPERATURE_FOR_RESPONSE,
  DEFAULT_MODEL_NAME,
  DEFAULT_GLOBAL_SPEED_SECONDS,
  RECENT_MESSAGES_COUNT,
  POSITIVE_RESPONSE_INDICATORS,
} from '../constants';

interface AgentState {
  persona: Persona;
  roomId: number;
  chatHistory: Array<HumanMessage | AIMessage>;
  thoughtLog?: string;
  shouldRespond: boolean;
  response?: string;
  shouldCancel?: boolean;
}

interface AgentConfig {
  personaId: number;
  roomId: number;
}

class PersonaAgent {
  private graph: ReturnType<typeof this.createGraph>;

  constructor() {
    this.graph = this.createGraph();
  }

  /**
   * LLMインスタンスを作成する共通メソッド
   * 設定の取得とLLM初期化の重複を避けるため、DRY原則に従って共通化
   * これにより、コードの保守性と一貫性を向上させる
   */
  private async createLLM(temperature: number): Promise<ChatOpenAI> {
    const settings = await this.getSettings();
    if (!settings.apiKey) {
      throw new Error('API key not configured');
    }

    const config: {
      openAIApiKey: string;
      modelName: string;
      temperature: number;
      configuration?: { baseURL?: string };
    } = {
      openAIApiKey: settings.apiKey,
      modelName: settings.model,
      temperature,
    };

    // OpenAI API互換サーバーのエンドポイントが設定されている場合、baseURLを設定
    // これにより、OpenAI以外のAPI互換サーバー（例：LocalAI、Ollamaなど）も使用可能
    // LangChainのChatOpenAIはconfiguration.baseURLでカスタムエンドポイントを指定可能
    if (settings.apiEndpoint) {
      config.configuration = {
        baseURL: settings.apiEndpoint,
      };
    }

    return new ChatOpenAI(config);
  }

  private createGraph() {
    // LangGraphのステートマシンを構築
    // 思考→競合チェック→行動決定→応答生成の順で処理を実行することで、ペルソナの自律的な会話参加を実現する
    const workflow = new StateGraph<AgentState>({
      channels: {
        persona: {
          reducer: (x: Persona, y?: Persona) => y ?? x,
          default: () => ({} as Persona),
        },
        roomId: {
          reducer: (x: number, y?: number) => y ?? x,
          default: () => 0,
        },
        chatHistory: {
          reducer: (x: Array<HumanMessage | AIMessage>, y?: Array<HumanMessage | AIMessage>) => y ?? x,
          default: () => [],
        },
        thoughtLog: {
          reducer: (x?: string, y?: string) => y ?? x,
          default: () => undefined,
        },
        shouldRespond: {
          reducer: (x: boolean, y?: boolean) => y ?? x,
          default: () => false,
        },
        response: {
          reducer: (x?: string, y?: string) => y ?? x,
          default: () => undefined,
        },
        shouldCancel: {
          reducer: (x?: boolean, y?: boolean) => y ?? x,
          default: () => undefined,
        },
      },
    });

    // 各処理ステップをノードとして追加
    // 各ノードを独立した処理単位として実装することで、テストとデバッグが容易になり、保守性が向上する
    workflow.addNode('think', this.thinkNode.bind(this));
    workflow.addNode('checkConflict', this.checkConflictNode.bind(this));
    workflow.addNode('decideAction', this.decideActionNode.bind(this));
    workflow.addNode('generateResponse', this.generateResponseNode.bind(this));

    // グラフの実行フローを定義
    // LangGraph.jsのAPIはバージョンによって異なる可能性があるため、型アサーションを使用
    // 型安全性を保ちつつ、柔軟にAPIを使用するため、any型の使用を許可
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflowWithEdges = workflow as unknown as {
      addEdge: (from: typeof START | string, to: string | typeof END) => void;
      addConditionalEdges: (
        source: string,
        condition: (state: AgentState) => string,
        pathMap: Record<string, string | typeof END>
      ) => void;
    };
    
    workflowWithEdges.addEdge(START, 'think');
    workflowWithEdges.addEdge('think', 'checkConflict');
    workflowWithEdges.addEdge('checkConflict', 'decideAction');
    
    // 条件分岐エッジ: 応答生成、キャンセル、待機のいずれかを選択
    // ペルソナの状態に応じて適切な次のアクションを決定し、自然な会話の流れを実現する
    workflowWithEdges.addConditionalEdges(
      'decideAction',
      this.shouldRespond.bind(this),
      {
        respond: 'generateResponse',
        cancel: END,
        wait: END,
      }
    );
    
    workflowWithEdges.addEdge('generateResponse', END);

    return workflow.compile();
  }

  private async thinkNode(
    state: AgentState
  ): Promise<Partial<AgentState>> {
    logger.debug('Thinking node executed', {
      personaId: state.persona.id,
      roomId: state.roomId,
    });

    const thoughtPrompt = await this.buildThoughtPrompt(state);
    
    try {
      const llm = await this.createLLM(DEFAULT_TEMPERATURE_FOR_THINKING);

      const thoughtResponse = await apiQueue.enqueue(() =>
        llm.invoke([new SystemMessage(thoughtPrompt)])
      );

      // LLMの応答は常にAIMessageインスタンスとして返される
      // 型安全性を保つため、型アサーションを使用
      const thought = (thoughtResponse as AIMessage).content as string;

      // ペルソナIDが存在しない場合は思考ログのみ返し、データベースへの保存をスキップ
      // 無効なペルソナIDでのデータベース操作を防ぐため
      if (!state.persona.id) {
        return {
          thoughtLog: thought,
        };
      }

      // デバッグと会話の追跡のために思考プロセスを記録する
      // これにより、ペルソナの思考プロセスを後から確認できる

      await db.thoughtLogs.add({
        personaId: state.persona.id,
        roomId: state.roomId,
        thought,
        timestamp: Date.now(),
      });

      logger.logThought(state.persona.id, thought, state.roomId);

      return {
        thoughtLog: thought,
      };
    } catch (error) {
      logger.error('Error in think node', {
        personaId: state.persona.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        thoughtLog: 'Error generating thought',
      };
    }
  }

  private async checkConflictNode(
    state: AgentState
  ): Promise<Partial<AgentState>> {
    const personaId = state.persona.id || 0;
    const conflictingPersonas = turnTakingManager.getConflictingPersonas(personaId);

    logger.debug('checkConflictNode executed', {
      personaId,
      roomId: state.roomId,
      conflictingPersonasCount: conflictingPersonas.length,
    });

    // 競合するペルソナがいない場合は早期リターン
    // 会話の流れを妨げないため、競合がない場合は何も変更しない
    if (conflictingPersonas.length === 0) {
      return {};
    }

    // 競合がある場合でも、他のペルソナのメッセージに応答しようとしている場合は、競合を無視する
    // これにより、ペルソナ同士の会話が促進される
    try {
      const allMessages = await db.messages
        .where('roomId')
        .equals(state.roomId)
        .sortBy('timestamp');
      
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const lastMessagePersonaId = lastMessage.type === 'persona' ? lastMessage.personaId || null : null;
        
        // 最後のメッセージが他のペルソナのものである場合は、競合を無視して応答を許可する
        if (lastMessagePersonaId !== null && lastMessagePersonaId !== personaId) {
          logger.info('Conflict detected but responding to other persona, allowing response', {
            personaId,
            roomId: state.roomId,
            lastMessagePersonaId,
            conflictingPersonas: conflictingPersonas.length,
          });
          return {};
        }
      }
    } catch (error) {
      logger.error('Error checking last message in conflict node', {
        personaId,
        roomId: state.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 競合がある場合は、APIリクエストを送信せずに単純にキャンセルする
    // レート制限を避けるため、shouldCancelTyping()の呼び出しを削除
    // 競合がある場合は常にキャンセルすることで、会話の流れを自然に保つ
    logger.info('Conflict detected, cancelling response', {
      personaId,
      roomId: state.roomId,
      conflictingPersonas: conflictingPersonas.length,
    });
    return { shouldCancel: true };
  }

  private async decideActionNode(
    state: AgentState
  ): Promise<Partial<AgentState>> {
    // 思考ログと会話の文脈に基づいて応答すべきか判定
    // ペルソナの個性と会話の流れを考慮して応答のタイミングを決定し、自然な会話を実現する
    logger.debug('decideActionNode executed', {
      personaId: state.persona.id,
      roomId: state.roomId,
      hasThoughtLog: !!state.thoughtLog,
      thoughtLogLength: state.thoughtLog?.length || 0,
    });
    const shouldRespond = await this.decideIfShouldRespond(state);
    logger.info('decideActionNode result', {
      personaId: state.persona.id,
      roomId: state.roomId,
      shouldRespond,
    });
    return { shouldRespond };
  }

  private async generateResponseNode(
    state: AgentState
  ): Promise<Partial<AgentState>> {
    // 応答すべきでない、またはキャンセルされた場合は早期リターン
    // 不要なLLM呼び出しを避けるため、条件チェックを最初に行い、コストとパフォーマンスを最適化する
    if (!state.shouldRespond || state.shouldCancel) {
      return {};
    }

    logger.debug('Generating response', {
      personaId: state.persona.id,
      roomId: state.roomId,
    });

    try {
      const llm = await this.createLLM(DEFAULT_TEMPERATURE_FOR_RESPONSE);

      // 会話履歴から自分の過去のメッセージを除外して、重複を防ぐ
      // [You]または[Persona X]形式のメッセージを除外
      const personaId = state.persona.id;
      const filteredHistory = state.chatHistory.filter((msg) => {
        if (msg instanceof AIMessage) {
          const content = msg.content as string;
          // 自分のメッセージは除外
          return (
            !content.startsWith(`[You]`) &&
            !(personaId && content.startsWith(`[Persona ${personaId}]`))
          );
        }
        return true;
      });

      const messages = [
        new SystemMessage(
          `${state.persona.systemPrompt}\n\nImportant: Do not repeat messages you have already sent. Check the conversation history to ensure your response is new and adds value.`
        ),
        ...filteredHistory,
      ];

      const response = await apiQueue.enqueue(() =>
        llm.invoke(messages)
      );

      // LLMの応答は常にAIMessageインスタンスとして返される
      // 型安全性を保つため、型アサーションを使用し、コンテンツを文字列として取得する
      let content = (response as AIMessage).content as string;

      // 応答からプレフィックスを除去（もし含まれている場合）
      // データベースにはプレフィックスなしで保存する
      content = content.replace(/^\[[^\]]+\]\s*/, '').trim();

      return {
        response: content,
      };
    } catch (error) {
      logger.error('Error generating response', {
        personaId: state.persona.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private shouldRespond(state: AgentState): string {
    // キャンセルが指示されている場合は最優先で処理
    // 会話の流れを尊重するため、他者の発言を優先し、自然な会話の流れを実現する
    if (state.shouldCancel) {
      logger.debug('shouldRespond: returning cancel', {
        personaId: state.persona.id,
        roomId: state.roomId,
      });
      return 'cancel';
    }

    // 応答すべき場合は応答を生成
    // ペルソナが発言すべきと判断した場合のみ、応答を生成する
    if (state.shouldRespond) {
      logger.debug('shouldRespond: returning respond', {
        personaId: state.persona.id,
        roomId: state.roomId,
      });
      return 'respond';
    }

    // どちらでもない場合は待機
    // 発言のタイミングが適切でない場合、待機して次の機会を待つ
    logger.debug('shouldRespond: returning wait', {
      personaId: state.persona.id,
      roomId: state.roomId,
    });
    return 'wait';
  }

  private async buildThoughtPrompt(state: AgentState): Promise<string> {
    // 最近の会話履歴を取得して思考プロンプトに含める
    // 会話の文脈を理解するため、直近のメッセージのみを使用してトークン数を抑制し、コストを最適化する
    const personaId = state.persona.id;
    const recentMessages = state.chatHistory
      .slice(-RECENT_MESSAGES_COUNT)
      .map((msg) => {
        if (msg instanceof HumanMessage) {
          return `User: ${msg.content}`;
        }
        // AIMessageの内容からペルソナ名を抽出（[Persona X]形式）
        const content = msg.content as string;
        return content.startsWith('[') ? content : `Someone: ${content}`;
      })
      .join('\n');

    // 自分の過去の発言を取得して、同じことを繰り返さないようにする
    // ペルソナが自分の過去の発言を認識し、同じメッセージを繰り返さないようにする
    let myPastMessages = '';
    if (personaId) {
      try {
        const myMessages = await db.messages
          .where('roomId')
          .equals(state.roomId)
          .and((msg) => msg.personaId === personaId)
          .sortBy('timestamp')
          .then((msgs) => msgs.slice(-5)); // 直近5つの自分のメッセージを取得

        if (myMessages.length > 0) {
          myPastMessages = `\n\nYour own past messages in this conversation:\n${myMessages
            .map(
              (msg, index) =>
                `${index + 1}. [${new Date(msg.timestamp).toLocaleTimeString()}] You said: "${msg.content}"`
            )
            .join('\n')}\n\nCRITICAL: These are YOUR OWN messages. Do NOT repeat similar greetings or responses. If you've already greeted the user or offered help, don't say the same thing again. Think of something new or different to say, or wait for a new topic.`;
        }
      } catch (error) {
        logger.error('Error loading past messages', {
          personaId,
          roomId: state.roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 過去の思考ログを取得して、内省の深化を促す
    // ペルソナが自分の過去の思考を参照し、同じことを繰り返さず、思考が発展するようにする
    let pastThoughts = '';
    if (personaId) {
      try {
        const previousThoughts = await db.thoughtLogs
          .where('roomId')
          .equals(state.roomId)
          .and((log) => log.personaId === personaId)
          .sortBy('timestamp')
          .then((logs) => logs.slice(-10)); // 直近10つの思考ログを取得（より多くの文脈を提供）

        if (previousThoughts.length > 0) {
          // 過去の思考の最初の数文字だけを取得して、パターンを識別しやすくする
          // 完全な思考を表示すると、LLMがそれを繰り返す可能性があるため、最小限の情報のみを提供
          const thoughtPatterns = previousThoughts.map(
            (log, index) =>
              `Thought ${index + 1}: Started with "${log.thought.substring(0, 50)}..."`
          );

          pastThoughts = `\n\n⚠️ AVOID THESE THOUGHT PATTERNS (you've already thought these):\n${thoughtPatterns.join('\n')}\n\n🚫 DO NOT start your current thought with similar phrases or ideas.\n✅ INSTEAD, think about:\n- A completely different aspect of the conversation\n- A new question or concern you haven't explored\n- How your understanding has changed\n- What you're curious about now that you haven't been before\n- A different emotional or analytical angle`;
        }
      } catch (error) {
        logger.error('Error loading past thoughts', {
          personaId,
          roomId: state.roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 他のペルソナの最新メッセージを確認
    let otherPersonaMessage = '';
    if (personaId) {
      try {
        const allMessages = await db.messages
          .where('roomId')
          .equals(state.roomId)
          .sortBy('timestamp');
        
        const otherPersonas = allMessages
          .filter(msg => msg.type === 'persona' && msg.personaId !== personaId)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 1); // 最新の他のペルソナのメッセージ
        
        if (otherPersonas.length > 0) {
          otherPersonaMessage = `\n\n⚠️ IMPORTANT: Another persona (Persona ${otherPersonas[0].personaId}) just said: "${otherPersonas[0].content.substring(0, 200)}"\n\n🎯 PRIORITY: Instead of asking the user another question, you should RESPOND to what the other persona said. Engage with their message, share your thoughts, or build on their idea. This creates a natural conversation flow between personas.\n\n❌ DO NOT: Ask the user another question right now\n✅ DO: Respond to the other persona's message, share your perspective, or continue the conversation they started`;
        }
      } catch (error) {
        logger.error('Error loading other persona messages', {
          personaId,
          roomId: state.roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return `You are ${state.persona.name}, ${state.persona.personality}

Recent chat history:
${recentMessages}${myPastMessages}${pastThoughts}${otherPersonaMessage}

You are thinking in this moment. Your thoughts should be UNIQUE and DIFFERENT from what you've thought before.

BEFORE YOU START THINKING:
1. Check what you've already SAID (above) - don't repeat those messages
2. Check what you've already THOUGHT (above) - don't repeat those thought patterns
3. If another persona just spoke, RESPOND TO THEM instead of asking the user another question
4. Find something NEW to think about

YOUR CURRENT THOUGHT MUST:
- Start with a DIFFERENT opening than your previous thoughts
- Explore a DIFFERENT aspect, question, or concern
- Show that you're thinking about something NEW, not repeating old thoughts
- Be unique and fresh, not a variation of previous thoughts
- If another persona spoke, think about how to respond to THEM, not the user

⚠️ CRITICAL: If you've already asked the user multiple questions and they haven't responded, STOP asking more questions. Instead:
- Respond to what other personas have said
- Share your own thoughts or experiences
- Comment on the conversation flow
- Wait for the user to respond naturally

Think about ONE of these NEW angles:
- What's a different way to understand the current situation?
- How can you respond to what another persona just said?
- What aspect of the conversation haven't you explored?
- How has the situation changed since your last thought?
- What are you curious about NOW that you weren't before?
- What's a different emotional or analytical perspective?

Then decide:
- Should you respond to the conversation now?
- What would you say that's NEW and doesn't repeat what you've already said?
- If another persona spoke, how will you respond to them?

Write your thought as a natural internal monologue. Make it UNIQUE - start differently, explore differently, think differently than before.`;
  }

  private async shouldCancelTyping(state: AgentState): Promise<boolean> {
    // ペルソナの個性に基づいてタイピングをキャンセルすべきかLLMで判定
    // 協調的なペルソナは他者の発言を優先し、自己主張の強いペルソナは発言を続ける
    // これにより、各ペルソナの個性に応じた自然な会話の流れを実現する
    try {
      const llm = await this.createLLM(DEFAULT_TEMPERATURE_FOR_THINKING);

      const cancelPrompt = `You are ${state.persona.name}, ${state.persona.personality}

Someone else is typing in the chat room. Based on your personality, should you cancel your own typing and let them speak first?

Respond with only "YES" or "NO".`;

      const response = await apiQueue.enqueue(() =>
        llm.invoke([new SystemMessage(cancelPrompt)])
      );

      // LLMの応答は常にAIMessageインスタンスとして返される
      // 型安全性を保つため、型アサーションを使用し、応答を大文字に変換して判定する
      const answer = ((response as AIMessage).content as string)
        .trim()
        .toUpperCase();
      return answer.includes('YES');
    } catch (error) {
      logger.error('Error deciding cancellation', {
        personaId: state.persona.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // エラー時はデフォルトでキャンセルしない
      // 会話の流れを維持するため、エラー時は現状維持を選択し、アプリケーションの動作を継続させる
      return false;
    }
  }

  private async decideIfShouldRespond(state: AgentState): Promise<boolean> {
    logger.info('decideIfShouldRespond: starting', {
      personaId: state.persona.id,
      roomId: state.roomId,
      hasThoughtLog: !!state.thoughtLog,
      thoughtLogLength: state.thoughtLog?.length || 0,
    });
    
    // 思考ログが存在しない場合は応答しない
    // 思考プロセスが完了していない場合は応答を生成しないため、不完全な応答を防ぐ
    if (!state.thoughtLog) {
      logger.info('No thought log, skipping response', {
        personaId: state.persona.id,
        roomId: state.roomId,
      });
      return false;
    }

    // 最近の会話履歴を確認
    const recentHistory = state.chatHistory.slice(-5);
    const personaId = state.persona.id;

    logger.info('decideIfShouldRespond: checking chat history', {
      personaId,
      roomId: state.roomId,
      chatHistoryLength: state.chatHistory.length,
      recentHistoryLength: recentHistory.length,
      recentHistoryTypes: recentHistory.map(msg => msg instanceof HumanMessage ? 'Human' : 'AI'),
    });

    // ユーザーの最新メッセージを確認
    // ユーザーの新しいメッセージがある場合は、過去の応答に関係なく応答すべき
    const lastUserMessage = recentHistory
      .slice()
      .reverse()
      .find((msg) => msg instanceof HumanMessage);
    
    const lastUserMessageContent = lastUserMessage 
      ? (typeof (lastUserMessage as HumanMessage).content === 'string' 
        ? String((lastUserMessage as HumanMessage).content).substring(0, 50) 
        : '[complex content]')
      : null;
    
    logger.info('decideIfShouldRespond: lastUserMessage check', {
      personaId,
      roomId: state.roomId,
      hasLastUserMessage: !!lastUserMessage,
      lastUserMessageContent,
    });

      // ユーザーの最新メッセージの後に、自分の応答があるかチェック
      if (lastUserMessage) {
        const lastUserMessageIndex = recentHistory.lastIndexOf(lastUserMessage);
        const messagesAfterUser = recentHistory.slice(lastUserMessageIndex + 1);
        
        // データベースから実際のメッセージを確認して、自分のメッセージかどうかを判定
        // これにより、メッセージの形式に関係なく正確に判定できる
        let hasRespondedToLastUserMessage = false;
        let allMessages: Array<{ type: string; personaId?: number; content: string; timestamp: number }> = [];
        let userMessage: { type: string; content: string; timestamp: number } | null = null;
        
        try {
          const userContent = typeof lastUserMessage.content === 'string' 
            ? lastUserMessage.content 
            : '';
          
          logger.info('Checking database for user message', {
            personaId,
            roomId: state.roomId,
            userContent,
          });
          
          // ユーザーのメッセージを探す
          allMessages = await db.messages
            .where('roomId')
            .equals(state.roomId)
            .sortBy('timestamp');
          
          logger.info('All messages loaded', {
            personaId,
            roomId: state.roomId,
            totalMessages: allMessages.length,
            messages: allMessages.map(msg => ({
              type: msg.type,
              personaId: msg.personaId,
              content: msg.content.substring(0, 50),
              timestamp: msg.timestamp,
            })),
          });
          
          userMessage = allMessages
            .filter(msg => msg.type === 'user' && msg.content === userContent)
            .sort((a, b) => b.timestamp - a.timestamp)[0] || null; // 最新のユーザーメッセージ
          
          logger.info('User message found', {
            personaId,
            roomId: state.roomId,
            userMessage: userMessage ? {
              content: userMessage.content.substring(0, 50),
              timestamp: userMessage.timestamp,
            } : null,
          });
          
          if (userMessage) {
            // ユーザーのメッセージの後に、自分のメッセージがあるかチェック
            const myMessagesAfterUser = allMessages.filter(
              msg => msg.personaId === personaId && msg.timestamp > userMessage!.timestamp
            );
            
            logger.info('My messages after user message', {
              personaId,
              roomId: state.roomId,
              myMessagesCount: myMessagesAfterUser.length,
              myMessages: myMessagesAfterUser.map(msg => ({
                content: msg.content.substring(0, 50),
                timestamp: msg.timestamp,
              })),
            });
            
            hasRespondedToLastUserMessage = myMessagesAfterUser.length > 0;
          }
        } catch (error) {
          logger.error('Error checking if already responded', {
            personaId,
            roomId: state.roomId,
            error: error instanceof Error ? error.message : String(error),
          });
          // エラー時は、フォールバックとしてメッセージ内容から判定
          hasRespondedToLastUserMessage = messagesAfterUser.some((msg) => {
            if (msg instanceof AIMessage) {
              const content = typeof msg.content === 'string' ? msg.content : '';
              // [You]または[Persona X]形式で自分のメッセージを確認
              return (
                content.startsWith(`[You]`) ||
                (personaId && content.startsWith(`[Persona ${personaId}]`))
              );
            }
            return false;
          });
        }

      // ユーザーの最新メッセージに既に応答している場合は、応答しない
      // これにより、同じメッセージの繰り返しを防ぐ
      logger.info('Checking if already responded to user message', {
        personaId,
        roomId: state.roomId,
        hasRespondedToLastUserMessage,
        messagesAfterUserCount: messagesAfterUser.length,
        messagesAfterUser: messagesAfterUser.map(msg => {
          if (msg instanceof AIMessage) {
            const content = typeof msg.content === 'string' ? msg.content : '[complex]';
            return content.substring(0, 50);
          }
          return '[not AI]';
        }),
      });
      
      if (hasRespondedToLastUserMessage) {
        // ユーザーのメッセージに既に応答している場合でも、
        // 他のペルソナのメッセージがある場合は会話を続けることを許可する
        // これにより、ペルソナ同士の自律的な会話が可能になる
        if (userMessage && allMessages.length > 0) {
          const otherPersonaMessages = allMessages.filter(
            (msg: { type: string; personaId?: number; timestamp: number }) => 
              msg.type === 'persona' 
              && msg.personaId !== personaId 
              && msg.timestamp > userMessage.timestamp
          );
          
          logger.info('Persona already responded to last user message', {
            personaId,
            roomId: state.roomId,
            otherPersonaMessagesCount: otherPersonaMessages.length,
            shouldContinueConversation: otherPersonaMessages.length > 0,
          });
          
          // 他のペルソナのメッセージがない場合は、応答しない
          // これにより、ユーザーのメッセージに対する応答の繰り返しを防ぐ
          if (otherPersonaMessages.length === 0) {
            logger.info('No other persona messages, skipping response', {
              personaId,
              roomId: state.roomId,
            });
            return false;
          }
          
          // 他のペルソナのメッセージがある場合は、会話を続けることを許可
          // ただし、思考ログに応答の意思が示されている必要がある
          logger.info('Other persona messages found, allowing conversation to continue', {
            personaId,
            roomId: state.roomId,
            otherPersonaMessagesCount: otherPersonaMessages.length,
          });
          // この場合は、後続の判定ロジックに進む（思考ログのチェックなど）
        } else {
          // データベースからメッセージを取得できなかった場合は、応答しない
          logger.info('Persona already responded to last user message, skipping', {
            personaId,
            roomId: state.roomId,
          });
          return false;
        }
      }

      // ユーザーの新しいメッセージがある場合は、思考ログに応答を示唆するキーワードが含まれているかチェック
      // ペルソナ同士の会話の場合と同じ判定ロジックを使用して、より柔軟に応答を許可する
      const thoughtLower = state.thoughtLog.toLowerCase();
      const hasPositiveIndicator = POSITIVE_RESPONSE_INDICATORS.some((indicator) =>
        thoughtLower.includes(indicator)
      );
      
      // 思考ログに「respond」「reply」「answer」「say」などの応答を示唆するキーワードもチェック
      const responseKeywords = ['respond', 'reply', 'answer', 'say', 'tell', 'share', 'ask', 'propose', 'suggest'];
      const hasResponseKeyword = responseKeywords.some((keyword) =>
        thoughtLower.includes(keyword)
      );
      
      // 思考ログに「I'll」「I will」「I should」「I want」などの意思表示があるかチェック
      const hasIntention = /\b(I'?ll|I will|I should|I want|I think|I feel|I'm going|let me|maybe I|should I|perhaps I|I could|I might|I would|I'd like|I'm considering|I'm wondering|I'm curious)\b/i.test(state.thoughtLog);
      
      // 思考ログに「next move」「next step」「respond now」「reply」などの明確な応答意図があるかチェック
      const hasExplicitResponseIntent = /\b(next move|next step|respond now|reply|answer|say|tell|share|ask|propose|suggest|craft a reply|send a message|go ahead|proceed)\b/i.test(state.thoughtLog);
      
      // ユーザーのメッセージがある場合は、より積極的に応答を許可する
      // 思考ログに応答の意思が示されていれば応答する
      const shouldRespond = hasPositiveIndicator || hasResponseKeyword || hasIntention || hasExplicitResponseIntent;
      
      logger.info('Checking if should respond to user message', {
        personaId,
        roomId: state.roomId,
        hasPositiveIndicator,
        hasResponseKeyword,
        hasIntention,
        hasExplicitResponseIntent,
        shouldRespond,
        thoughtPreview: state.thoughtLog.substring(0, 200),
        thoughtLowerPreview: thoughtLower.substring(0, 200),
      });
      
      return shouldRespond;
    }

    // ユーザーのメッセージがない場合（ペルソナ同士の会話など）は、最近の応答をチェック
    // ただし、自分の応答のみをチェック（他のペルソナの応答は無視）
    const myRecentResponses = recentHistory.filter((msg) => {
      if (msg instanceof AIMessage) {
        const content = msg.content as string;
        // [You]または[Persona X]形式で自分のメッセージを確認
        return (
          content.startsWith(`[You]`) ||
          (personaId && content.startsWith(`[Persona ${personaId}]`))
        );
      }
      return false;
    });
    
    // データベースから最新のメッセージを確認して、連続送信を防ぐ
    let lastMessagePersonaId: number | null = null;
    try {
      const allMessages = await db.messages
        .where('roomId')
        .equals(state.roomId)
        .sortBy('timestamp');
      
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        lastMessagePersonaId = lastMessage.type === 'persona' ? lastMessage.personaId || null : null;
      }
    } catch (error) {
      logger.error('Error checking last message', {
        personaId,
        roomId: state.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    // 最後のメッセージが自分のもので、かつ最近自分が応答している場合は、応答を制限する
    // これにより、同じペルソナが連続してメッセージを送信するのを防ぐ
    if (lastMessagePersonaId === personaId && myRecentResponses.length > 0) {
      logger.info('Same persona sent last message, checking if should limit response', {
        personaId,
        roomId: state.roomId,
        myRecentResponsesCount: myRecentResponses.length,
        lastMessagePersonaId,
      });
      
      // 最近自分が1回以上応答している場合は、応答を制限する
      // これにより、同じペルソナが連続してメッセージを送信するのを防ぐ
      if (myRecentResponses.length >= 1) {
        const thoughtLower = state.thoughtLog.toLowerCase();
        const hasStrongIntention = /\b(I'?ll|I will|I should|I want|I'm going|let me|go ahead|proceed|respond now)\b/i.test(state.thoughtLog);
        const hasResponseToOtherPersona = thoughtLower.includes('persona') && (thoughtLower.includes('respond') || thoughtLower.includes('reply') || thoughtLower.includes('acknowledge'));
        
        // 他のペルソナのメッセージに応答しようとしている場合は、応答を許可する
        // それ以外の場合は、応答を制限する
        if (!hasResponseToOtherPersona) {
          logger.info('Limiting response to prevent consecutive messages from same persona', {
            personaId,
            roomId: state.roomId,
            myRecentResponsesCount: myRecentResponses.length,
            hasStrongIntention,
            hasResponseToOtherPersona,
          });
          return false;
        }
      }
    } else if (lastMessagePersonaId !== null && lastMessagePersonaId !== personaId) {
      // 最後のメッセージが他のペルソナのものである場合は、応答を優先する
      // これにより、ペルソナ同士の会話が促進される
      logger.info('Other persona sent last message, prioritizing response', {
        personaId,
        roomId: state.roomId,
        lastMessagePersonaId,
      });
      // この場合は、後続の判定ロジックに進む（思考ログのチェックなど）
    }

    // 思考ログの内容から応答すべきか判定する簡易的なヒューリスティック
    // より高度な実装ではLLMを使用して判定することも可能だが、コストとパフォーマンスのバランスを考慮して簡易的な方法を採用
    // 思考ログに応答を示唆するキーワードが含まれているかチェック
    const thoughtLower = state.thoughtLog.toLowerCase();
    const hasPositiveIndicator = POSITIVE_RESPONSE_INDICATORS.some((indicator) =>
      thoughtLower.includes(indicator)
    );
    
    // 思考ログに「respond」「reply」「answer」「say」などの応答を示唆するキーワードもチェック
    const responseKeywords = ['respond', 'reply', 'answer', 'say', 'tell', 'share', 'ask', 'propose', 'suggest'];
    const hasResponseKeyword = responseKeywords.some((keyword) =>
      thoughtLower.includes(keyword)
    );
    
    // 思考ログに「I'll」「I will」「I should」「I want」などの意思表示があるかチェック
    // より広範囲なパターンも含める（"should I", "perhaps I should", "I could", "I might"など）
    const hasIntention = /\b(I'?ll|I will|I should|I want|I think|I feel|I'm going|let me|maybe I|should I|perhaps I|I could|I might|I would|I'd like|I'm considering|I'm wondering|I'm curious)\b/i.test(state.thoughtLog);
    
    // 思考ログに「next move」「next step」「respond now」「reply」などの明確な応答意図があるかチェック
    const hasExplicitResponseIntent = /\b(next move|next step|respond now|reply|answer|say|tell|share|ask|propose|suggest|craft a reply|send a message|go ahead|proceed)\b/i.test(state.thoughtLog);
    
    logger.info('Checking if should respond (no user message)', {
      personaId,
      roomId: state.roomId,
      hasPositiveIndicator,
      hasResponseKeyword,
      hasIntention,
      hasExplicitResponseIntent,
      myRecentResponsesCount: myRecentResponses.length,
      thoughtPreview: state.thoughtLog.substring(0, 150),
    });
    
    // 最近自分が応答している場合は、応答を制限する（連続した応答を防ぐ）
    // ただし、思考ログに明確な応答の意思がある場合は応答する
    // また、最近の応答が3つ以上の場合のみ制限する（会話を促進するため）
    if (myRecentResponses.length >= 3 && !hasIntention && !hasResponseKeyword && !hasExplicitResponseIntent) {
      logger.info('Persona already responded recently, skipping', {
        personaId,
        roomId: state.roomId,
        myRecentResponsesCount: myRecentResponses.length,
      });
      return false;
    }
    
    // ペルソナ同士の会話の場合、思考ログに応答を示唆するキーワードがあれば応答する
    // より緩和した判定：いずれかの条件を満たせば応答する
    // さらに緩和：最近の応答が少ない場合（3つ未満）は、思考ログがあれば応答を許可する
    // これにより、会話が自然に進むようになる
    const hasAnyIndicator = hasPositiveIndicator || hasResponseKeyword || hasIntention || hasExplicitResponseIntent;
    
    // 最近の応答が少ない場合は、思考ログがあれば応答を許可する（会話を促進するため）
    const shouldRespond = hasAnyIndicator || (myRecentResponses.length < 3 && state.thoughtLog.length > 50);
    
    logger.info('Final decision on whether to respond', {
      personaId,
      roomId: state.roomId,
      shouldRespond,
      reasons: {
        hasPositiveIndicator,
        hasResponseKeyword,
        hasIntention,
        hasExplicitResponseIntent,
        myRecentResponsesCount: myRecentResponses.length,
        thoughtLogLength: state.thoughtLog.length,
        fallbackReason: myRecentResponses.length < 3 && state.thoughtLog.length > 50,
      },
    });
    
    return shouldRespond;
  }

  private async getSettings(): Promise<Settings> {
    const settings = await db.settings.toArray();
    // 設定が存在しない場合はデフォルト値を返す
    // アプリケーションの動作を保証するため、常に有効な設定オブジェクトを返す
    // これにより、設定が未初期化でもエラーが発生せず、アプリケーションが正常に動作する
    return settings[0] || {
      apiKey: '',
      apiEndpoint: undefined,
      model: DEFAULT_MODEL_NAME,
      globalSpeed: DEFAULT_GLOBAL_SPEED_SECONDS,
      debugMode: false,
    };
  }

  async process(config: AgentConfig): Promise<string | null> {
    const persona = await db.personas.get(config.personaId);
    // ペルソナが存在しない場合はエラーを投げる
    // 無効なペルソナIDで処理を続行すると予期しない動作を引き起こすため、早期にエラーを検出する
    if (!persona) {
      throw new Error(`Persona ${config.personaId} not found`);
    }

    // 会話履歴を取得してLangChainのメッセージ形式に変換
    // 会話の文脈を理解するために、時系列順にソートされたメッセージが必要
    // これにより、ペルソナが会話の流れを正確に把握できる
    const messages = await db.messages
      .where('roomId')
      .equals(config.roomId)
      .sortBy('timestamp');

    // デバッグ用：会話履歴の内容をログに出力
    logger.debug('Chat history loaded', {
      personaId: config.personaId,
      roomId: config.roomId,
      messageCount: messages.length,
      recentMessages: messages.slice(-5).map((msg) => ({
        type: msg.type,
        content: msg.content.substring(0, 50),
        timestamp: new Date(msg.timestamp).toISOString(),
        personaId: msg.personaId,
      })),
    });

    const chatHistory = messages.map((msg) => {
      if (msg.type === 'user') {
        return new HumanMessage(msg.content);
      }
      // ペルソナのメッセージの場合、どのペルソナからのメッセージかを識別できるようにする
      // これにより、ペルソナが自分の過去のメッセージを認識できる
      const personaName =
        msg.personaId === persona.id
          ? 'You'
          : `Persona ${msg.personaId}`;
      return new AIMessage(`[${personaName}] ${msg.content}`);
    });

    const initialState: AgentState = {
      persona,
      roomId: config.roomId,
      chatHistory,
      shouldRespond: false,
    };

    try {
      const result = await this.graph.invoke(initialState);
      return result.response || null;
    } catch (error) {
      logger.error('Error processing agent', {
        personaId: config.personaId,
        error: error instanceof Error ? error.message : String(error),
      });
      // エラー時はnullを返して処理を継続可能にする
      // 一つのペルソナのエラーが全体の処理を停止させないようにし、アプリケーションの堅牢性を向上させる
      return null;
    }
  }
}

export const personaAgent = new PersonaAgent();
