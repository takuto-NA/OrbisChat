/**
 * api-queue - APIリクエストキュー管理
 * 
 * このファイルは、OpenAI APIへのリクエストをキューイングし、レート制限を
 * 回避するためのキューシステムを実装しています。同時実行数の制限、リクエスト間の
 * 最小間隔の維持、リトライ機能などを提供し、APIの安定した利用を保証します。
 */

import { logger } from './logger';
import {
  MAX_CONCURRENT_REQUESTS,
  MIN_REQUEST_INTERVAL_MS,
  EXPONENTIAL_BACKOFF_BASE_MS,
  MAX_RETRY_ATTEMPTS,
} from './constants';

interface QueuedRequest<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

class APIQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private concurrentLimit = MAX_CONCURRENT_REQUESTS;
  private activeRequests = 0;
  private minInterval = MIN_REQUEST_INTERVAL_MS;
  private lastRequestTime = 0;

  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // リクエストの追跡とデバッグのため、タイムスタンプとランダム値の組み合わせで一意なIDを生成
      const id = `req-${Date.now()}-${Math.random()}`;
      this.queue.push({
        id,
        execute: request,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      logger.debug(`API request queued: ${id}`, {
        queueLength: this.queue.length,
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.concurrentLimit) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minInterval) {
        await this.sleep(this.minInterval - timeSinceLastRequest);
      }

      const request = this.queue.shift();
      if (!request) break;

      this.activeRequests++;
      this.lastRequestTime = Date.now();

      this.executeRequest(request)
        .finally(() => {
          this.activeRequests--;
          this.processQueue();
        });
    }

    this.processing = false;
  }

  private async executeRequest(request: QueuedRequest): Promise<void> {
    const startTime = Date.now();
    logger.debug(`Executing API request: ${request.id}`);

    try {
      const result = await this.executeWithRetry(request.execute);
      const duration = Date.now() - startTime;
      logger.logAPIRequest(request.id, duration, true);
      request.resolve(result);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logAPIRequest(request.id, duration, false);
      // PromiseのrejectはErrorインスタンスを期待するため、型アサーションを使用
      // これにより、エラーハンドリングの一貫性を保つ
      request.reject(error as Error);
    }
  }

  private async executeWithRetry(
    request: () => Promise<unknown>,
    maxRetries = MAX_RETRY_ATTEMPTS
  ): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await request();
      } catch (error) {
        // PromiseのrejectはErrorインスタンスを期待するため、型アサーションを使用
        lastError = error as Error;
        // APIエラーレスポンスにはstatusプロパティが含まれる可能性があるため、型アサーションを使用
        // レート制限エラー（429）を検出するため、statusコードとエラーメッセージの両方をチェック
        const errorObj = error as { status?: number; message?: string };
        const isRateLimit = 
          errorObj.status === 429 || 
          (errorObj.message && (
            errorObj.message.includes('429') || 
            errorObj.message.includes('Too Many Requests')
          ));

        if (isRateLimit && attempt < maxRetries) {
          // レート制限エラー時は、指数バックオフでリトライ間隔を段階的に増やす
          // これにより、APIサーバーへの負荷を軽減し、成功確率を向上させる
          // 429エラーの場合は、より長いバックオフ時間を設定
          const backoffDelay = Math.pow(2, attempt) * EXPONENTIAL_BACKOFF_BASE_MS;
          logger.warn(
            `Rate limit hit, retrying after ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await this.sleep(backoffDelay);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * 指定された時間（ミリ秒）だけ待機する
   * 
   * リクエスト間の間隔を制御するため、またはリトライ時のバックオフに使用する
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 現在キューに待機しているリクエスト数を取得する
   * 
   * デバッグやモニタリングのために使用される
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 現在実行中のリクエスト数を取得する
   * 
   * デバッグやモニタリングのために使用される
   */
  getActiveRequests(): number {
    return this.activeRequests;
  }
}

export const apiQueue = new APIQueue();

