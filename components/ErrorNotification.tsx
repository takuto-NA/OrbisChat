/**
 * ErrorNotification - エラー通知コンポーネント
 * 
 * このファイルは、アプリケーション内で発生したエラーをユーザーに分かりやすく
 * 表示するためのコンポーネントです。APIキーエラーなどの重要なエラーに対しては、
 * 設定ページへのリンクを提供し、ユーザーが問題を解決できるようにします。
 */

'use client';

import { useState, useEffect } from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export interface ErrorInfo {
  message: string;
  type?: 'apiKey' | 'general';
  timestamp: number;
}

interface ErrorNotificationProps {
  error: ErrorInfo | null;
  onDismiss: () => void;
}

export function ErrorNotification({ error, onDismiss }: ErrorNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (error) {
      setIsVisible(true);
      // 5秒後に自動的に非表示にする
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300); // アニメーション完了後にコールバック
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [error, onDismiss]);

  if (!error || !isVisible) {
    return null;
  }

  const isApiKeyError = error.type === 'apiKey' || error.message.includes('API key');

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-md transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div
        className={`rounded-lg shadow-lg p-4 ${
          isApiKeyError
            ? 'bg-yellow-50 border-2 border-yellow-400'
            : 'bg-red-50 border-2 border-red-400'
        }`}
      >
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon
            className={`w-6 h-6 flex-shrink-0 ${
              isApiKeyError ? 'text-yellow-600' : 'text-red-600'
            }`}
          />
          <div className="flex-1">
            <h3
              className={`font-semibold mb-1 ${
                isApiKeyError ? 'text-yellow-800' : 'text-red-800'
              }`}
            >
              {isApiKeyError ? 'API Key Not Configured' : 'Error'}
            </h3>
            <p
              className={`text-sm mb-2 ${
                isApiKeyError ? 'text-yellow-700' : 'text-red-700'
              }`}
            >
              {error.message}
            </p>
            {isApiKeyError && (
              <Link
                href="/settings"
                className="text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
              >
                Go to Settings to configure API key →
              </Link>
            )}
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className={`flex-shrink-0 ${
              isApiKeyError ? 'text-yellow-600 hover:text-yellow-800' : 'text-red-600 hover:text-red-800'
            }`}
            aria-label="Dismiss error"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}


