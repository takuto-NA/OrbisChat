/**
 * TypingIndicator - タイピングインジケーターコンポーネント
 * 
 * このファイルは、現在タイピング中のペルソナを表示するUIコンポーネントです。
 * 定期的にタイピング状態を更新し、ユーザーにどのペルソナが応答を準備しているかを
 * 視覚的に伝えることで、会話の流れを自然に表現します。
 */

'use client';

import { turnTakingManager } from '@/lib/turn-taking';
import { useEffect, useState } from 'react';
import { TYPING_STATE_UPDATE_INTERVAL_MS } from '@/lib/constants';

export function TypingIndicator() {
  const [typingStates, setTypingStates] = useState(
    turnTakingManager.getTypingStates()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTypingStates(turnTakingManager.getTypingStates());
    }, TYPING_STATE_UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  if (typingStates.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2">
      {typingStates.map((state) => (
        <div
          key={state.personaId}
          className="text-sm text-gray-500 italic animate-pulse"
        >
          {state.personaName} is typing...
        </div>
      ))}
    </div>
  );
}

