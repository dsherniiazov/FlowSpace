export type AuthTokenResponse = {
  access_token: string;
  token_type?: string;
};

export type UserPublic = {
  id: number;
  email: string;
  name: string;
  last_name: string;
  is_admin: boolean;
  avatar_path?: string | null;
};

export type Lesson = {
  id: number;
  title: string;
  content_markdown: string;
  section_id: number | null;
  order_index?: number | null;
  is_published?: boolean | null;
  created_at?: string | null;
};

export type Section = {
  id: number;
  title: string;
  color?: string | null;
  order_index?: number | null;
  is_published?: boolean | null;
  created_at?: string | null;
};

export type SystemModel = {
  id: number;
  owner_id: number | null;
  lesson_id: number | null;
  title: string;
  graph_json: Record<string, unknown>;
  is_public?: boolean | null;
  is_template?: boolean | null;
  created_at?: string | null;
};

export type RunStep = {
  step_index: number;
  time: number;
  values: Record<string, number>;
};

export type RunDetail = {
  id: number;
  user_id: number;
  model_id: number | null;
  model_snapshot: Record<string, unknown>;
  dt: number;
  steps: number;
  engine_version: string;
  seed: number | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

export type RunCreatePayload = {
  model_id?: number;
  graph_json?: Record<string, unknown>;
  dt: number;
  steps: number;
  engine_version: string;
  seed?: number;
};

export type CompletedLesson = {
  lesson_id: number;
  completed_at: string;
};

export type LessonTask = {
  id: number;
  lesson_id: number;
  title: string;
  description: string;
  system_id?: number | null;
  order_index?: number | null;
  created_at?: string | null;
};

export type CompletedTask = {
  task_id: number;
  completed_at: string;
};
