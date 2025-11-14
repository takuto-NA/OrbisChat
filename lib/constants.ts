/**
 * constants - アプリケーション全体で使用する定数定義
 * 
 * このファイルは、アプリケーション全体で使用される定数を集約しています。
 * マジックナンバーを避け、DRY原則に従って定数を一元管理することで、
 * 保守性と一貫性を向上させます。
 */

// LLM設定のデフォルト値
export const DEFAULT_MODEL_NAME = 'gpt-4o-mini';
export const DEFAULT_TEMPERATURE_FOR_THINKING = 0.7;
export const DEFAULT_TEMPERATURE_FOR_RESPONSE = 0.8;
export const DEFAULT_GLOBAL_SPEED_SECONDS = 3;

// 時間変換の定数
export const SECONDS_TO_MILLISECONDS = 1000;

// ペルソナ自律性の設定
// レート制限を避けるため、チェック間隔を長く設定
export const CHECK_INTERVAL_MS = 20000; // 20秒ごとにチェック（10秒から延長）
export const THOUGHT_ONLY_INTERVAL_MS = 60000; // 60秒ごとに思考のみ実行（30秒から延長）
export const CONFLICT_CHECK_DELAY_MS = 500; // 競合チェックの遅延時間（ミリ秒）

// タイピング状態の更新間隔（ミリ秒）
export const TYPING_STATE_UPDATE_INTERVAL_MS = 100;

// 思考プロンプト生成の定数
export const RECENT_MESSAGES_COUNT = 10;

// 応答判定の定数
export const POSITIVE_RESPONSE_INDICATORS = ['yes', 'should', 'will', 'want', 'think'];

// APIキュー設定の定数
// レート制限を避けるため、同時実行数を1に制限し、リクエスト間隔を長くする
export const MAX_CONCURRENT_REQUESTS = 1; // 完全に順次処理にする
export const MIN_REQUEST_INTERVAL_MS = 3000; // リクエスト間の最小間隔を3秒に設定（Groq APIのレート制限に対応）
export const EXPONENTIAL_BACKOFF_BASE_MS = 10000; // レート制限時のバックオフを10秒から開始
export const MAX_RETRY_ATTEMPTS = 3;

// UI表示の定数
export const THOUGHT_LOG_PREVIEW_LENGTH = 100; // 思考ログのプレビュー表示文字数

// ペルソナ設定の定数
export const MIN_RESPONSE_DELAY_MULTIPLIER = 0.1;
export const MAX_RESPONSE_DELAY_MULTIPLIER = 5;
export const RESPONSE_DELAY_MULTIPLIER_STEP = 0.1;

// データエクスポートのバージョン
export const EXPORT_DATA_VERSION = '1.0.0';

