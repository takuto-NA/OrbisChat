/**
 * usePersonaAutonomy - ペルソナ自律性管理フック
 * 
 * このファイルは、ペルソナが自律的に会話に参加する機能を実現するフックです。
 * 定期的にペルソナの思考プロセスを実行し、応答を生成してメッセージを送信します。
 * タイピング状態の管理、競合チェック、遅延処理などを統合し、
 * 自然な会話の流れを実現しています。
 */

'use client';

import { useEffect, useRef } from 'react';
import { db, Persona, ChatRoom } from '@/lib/db';
import { personaAgent } from '@/lib/langgraph/persona-agent';
import { turnTakingManager } from '@/lib/turn-taking';
import { logger } from '@/lib/logger';
import {
  CHECK_INTERVAL_MS,
  THOUGHT_ONLY_INTERVAL_MS,
  CONFLICT_CHECK_DELAY_MS,
  SECONDS_TO_MILLISECONDS,
  DEFAULT_GLOBAL_SPEED_SECONDS,
} from '@/lib/constants';

export function usePersonaAutonomy(
  roomId: number | null,
  onError?: (error: unknown) => void
): void {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const thoughtIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const errorHandledRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef<boolean>(false); // 処理中のフラグ

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const checkAndReact = async (): Promise<void> => {
      // 既に処理中の場合はスキップ（レート制限を避けるため）
      if (isProcessingRef.current) {
        logger.debug('Skipping checkAndReact - already processing');
        return;
      }

      isProcessingRef.current = true;
      try {
        const personas = await db.personas.toArray();
        const room = await db.rooms.get(roomId);
        if (!room) {
          isProcessingRef.current = false;
          return;
        }

        // Process each persona sequentially to avoid rate limiting
        // レート制限を避けるため、各ペルソナを順次処理する
        for (const persona of personas) {
          if (!persona.id) continue;

          try {
            // Check if persona should react
            const response = await personaAgent.process({
              personaId: persona.id,
              roomId,
            });

            // 応答がない場合は処理をスキップし、不要なタイピング開始を防ぐ
            // 早期リターンでネストを減らし、可読性を向上させる
            if (!response) {
              logger.debug('No response generated, skipping', {
                personaId: persona.id,
                roomId,
              });
              // 次のペルソナの処理前に待機時間を設ける（レート制限を避けるため）
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
            
            logger.debug('Response generated, proceeding with message send', {
              personaId: persona.id,
              roomId,
              responseLength: response.length,
              responsePreview: response.substring(0, 50),
            });

            // 各ペルソナの処理の間に待機時間を設ける（レート制限を避けるため）
            // これにより、APIリクエストが連続して送信されることを防ぐ
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Start typing
            await turnTakingManager.startTyping(
              persona.id,
              persona.name,
              persona.responseDelayMultiplier
            );

            // タイピング開始後に競合をチェックし、必要に応じてキャンセルする
            // 短い遅延を入れることで、同時にタイピングを開始したペルソナ間の競合を検出できる
            setTimeout(async () => {
              await handleTypingWithConflictCheck(
                persona.id!,
                persona.responseDelayMultiplier,
                roomId,
                response
              );
            }, CONFLICT_CHECK_DELAY_MS);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRateLimit = errorMessage.includes('429') || errorMessage.includes('Too Many Requests');
            
            if (isRateLimit) {
              logger.warn('Rate limit hit while processing persona autonomy', {
                personaId: persona.id,
                roomId,
              });
              // レート制限の場合は、次のペルソナの処理を長めに遅らせる
              // Groq APIのレート制限に対応するため、10秒待機
              await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
              logger.error('Error processing persona autonomy', {
                personaId: persona.id,
                error: errorMessage,
              });

              // APIキーエラーの場合、ユーザーに通知する
              // 同じエラーを繰り返し通知しないため、エラーキーで管理
              const errorKey = `persona-${persona.id}-${errorMessage}`;

              if (
                onError &&
                (errorMessage.includes('API key') ||
                  errorMessage.includes('API key not configured')) &&
                !errorHandledRef.current.has(errorKey)
              ) {
                errorHandledRef.current.add(errorKey);
                onError(error);
                // 5分後にエラーキーをクリアし、再度通知できるようにする
                setTimeout(() => {
                  errorHandledRef.current.delete(errorKey);
                }, 5 * 60 * 1000);
              }
            }
          }
        }
      } catch (error) {
        logger.error('Error in autonomy check', {
          roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        isProcessingRef.current = false;
      }
    };

    const thinkOnly = async (): Promise<void> => {
      // 既に処理中の場合はスキップ（レート制限を避けるため）
      if (isProcessingRef.current) {
        logger.debug('Skipping thinkOnly - already processing');
        return;
      }

      isProcessingRef.current = true;
      try {
        const personas = await db.personas.toArray();
        // レート制限を避けるため、各ペルソナを順次処理する
        // forループでawaitを使用することで、1つずつ処理される
        for (const persona of personas) {
          if (!persona.id) continue;
          try {
            // Just trigger thinking without action
            await personaAgent.process({
              personaId: persona.id,
              roomId,
            });
            logger.debug('Thought-only execution', {
              personaId: persona.id,
              roomId,
            });
            // 各ペルソナの処理の間に待機時間を設ける（レート制限を避けるため）
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            // 429エラーの場合はログに記録するが、処理を続行する
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRateLimit = errorMessage.includes('429') || errorMessage.includes('Too Many Requests');
            
            if (isRateLimit) {
              logger.warn('Rate limit hit in thought-only execution', {
                personaId: persona.id,
                roomId,
              });
              // レート制限の場合は、次のペルソナの処理を長めに遅らせる
              // Groq APIのレート制限に対応するため、10秒待機
              await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
              logger.error('Error in thought-only execution', {
                personaId: persona.id,
                error: errorMessage,
              });
            }
          }
        }
      } catch (error) {
        logger.error('Error in think-only check', {
          roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        isProcessingRef.current = false;
      }
    };

    // Start intervals
    intervalRef.current = setInterval(checkAndReact, CHECK_INTERVAL_MS);
    thoughtIntervalRef.current = setInterval(thinkOnly, THOUGHT_ONLY_INTERVAL_MS);

    // Initial check
    checkAndReact();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (thoughtIntervalRef.current) {
        clearInterval(thoughtIntervalRef.current);
      }
    };
  }, [roomId]);
}

/**
 * タイピング中の競合チェックとメッセージ送信を処理する
 * 
 * 競合するペルソナがいる場合は、persona-agentを使用してキャンセルすべきか判定する。
 * キャンセルしない場合は、遅延後にメッセージを送信する。
 */
async function handleTypingWithConflictCheck(
  personaId: number,
  responseDelayMultiplier: number,
  roomId: number,
  response: string
): Promise<void> {
  const conflictingPersonas = turnTakingManager.getConflictingPersonas(personaId);

  // 競合がない場合は、そのままメッセージを送信
  // 早期リターンでネストを減らし、可読性を向上させる
  if (conflictingPersonas.length === 0) {
    logger.debug('No conflict detected, sending message', {
      personaId,
      roomId,
      responseDelayMultiplier,
    });
    await sendMessageAfterDelay(personaId, roomId, response, responseDelayMultiplier);
    return;
  }

  // 競合がある場合は、タイピングをキャンセルする
  // personaAgent.process()のcheckConflictNodeで既に競合チェックが行われているため、
  // ここで再処理する必要はない。競合がある場合は単純にキャンセルする。
  // これにより、不要なAPIリクエストを避け、レート制限を防ぐ
  logger.info('Persona cancelled typing due to conflict', {
    personaId,
    roomId,
    conflictingPersonas: conflictingPersonas.length,
    conflictingPersonaIds: conflictingPersonas.map(p => p.personaId),
  });
  turnTakingManager.cancelTyping(personaId);
}

/**
 * 遅延後にペルソナのメッセージを送信する
 * 
 * グローバル速度とペルソナの遅延倍率を考慮して、適切なタイミングでメッセージを送信する。
 */
async function sendMessageAfterDelay(
  personaId: number,
  roomId: number,
  response: string,
  responseDelayMultiplier: number
): Promise<void> {
  const globalSpeed = await getGlobalSpeed();
  // グローバル速度（秒）をミリ秒に変換し、ペルソナの遅延倍率を適用
  // これにより、各ペルソナの個性に応じた応答速度を実現する
  const delay = globalSpeed * SECONDS_TO_MILLISECONDS * responseDelayMultiplier;
  
  logger.debug('Scheduling message send', {
    personaId,
    roomId,
    delay,
    globalSpeed,
    responseDelayMultiplier,
  });
  
  setTimeout(async () => {
    // 送信前に再度競合をチェック（送信までの間に競合が発生した可能性があるため）
    const conflictingPersonas = turnTakingManager.getConflictingPersonas(personaId);
    if (conflictingPersonas.length > 0) {
      logger.info('Conflict detected before sending, cancelling', {
        personaId,
        roomId,
        conflictingPersonas: conflictingPersonas.length,
      });
      turnTakingManager.cancelTyping(personaId);
      return;
    }
    
    await sendPersonaMessage(personaId, roomId, response);
    turnTakingManager.cancelTyping(personaId);
  }, delay);
}

/**
 * ペルソナのメッセージをデータベースに保存する
 * 
 * ペルソナが生成した応答をメッセージとしてデータベースに追加し、
 * チャットルームに表示されるようにする。
 */
async function sendPersonaMessage(
  personaId: number,
  roomId: number,
  content: string
): Promise<void> {
  // ペルソナの応答をメッセージとしてデータベースに保存し、チャットルームに表示されるようにする
  await db.messages.add({
    roomId,
    personaId,
    content,
    timestamp: Date.now(),
    type: 'persona',
  });
  logger.info('Persona message sent', {
    personaId,
    roomId,
    content: content.substring(0, 50),
  });
}

/**
 * グローバル速度設定を取得する
 * 
 * データベースからグローバル速度設定を読み込み、デフォルト値を返す。
 * 設定が存在しない場合はデフォルト値を使用し、アプリケーションの動作を保証する。
 */
async function getGlobalSpeed(): Promise<number> {
  // 設定が存在しない場合はデフォルト値を使用し、アプリケーションの動作を保証する
  const settings = await db.settings.toArray();
  return settings[0]?.globalSpeed || DEFAULT_GLOBAL_SPEED_SECONDS;
}

