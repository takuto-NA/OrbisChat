/**
 * useErrorNotification - エラー通知管理フック
 * 
 * このファイルは、アプリケーション全体でエラー通知を管理するための
 * カスタムフックです。エラーの発生、表示、非表示を一元管理し、
 * 複数のコンポーネント間でエラー状態を共有できるようにします。
 */

'use client';

import { useState, useCallback } from 'react';
import { ErrorInfo } from '@/components/ErrorNotification';

export function useErrorNotification() {
  const [error, setError] = useState<ErrorInfo | null>(null);

  const showError = useCallback((message: string, type?: 'apiKey' | 'general') => {
    setError({
      message,
      type,
      timestamp: Date.now(),
    });
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const handleError = useCallback(
    (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      
      // APIキーエラーの検出
      const isApiKeyError =
        errorMessage.includes('API key') ||
        errorMessage.includes('API key not configured');

      showError(
        isApiKeyError
          ? 'OpenAI API key is not configured. Please configure it in Settings to enable persona responses.'
          : errorMessage,
        isApiKeyError ? 'apiKey' : 'general'
      );
    },
    [showError]
  );

  return {
    error,
    showError,
    dismissError,
    handleError,
  };
}


