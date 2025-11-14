/**
 * PersonasPage - ペルソナ管理ページ
 * 
 * このファイルは、ペルソナ管理ページのルーティングとレイアウトを実装しています。
 * PersonaManagerコンポーネントを表示し、ペルソナの管理機能へのアクセスを提供します。
 */

'use client';

import { PersonaManager } from '@/components/PersonaManager';

export default function PersonasPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PersonaManager />
    </div>
  );
}

