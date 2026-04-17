export type AuthTokenResponse = {
  access_token: string;
  token_type?: string;
};

export type OAuthProvidersResponse = {
  google: boolean;
  github: boolean;
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
  source_system_id?: number | null;
  title: string;
  graph_json: Record<string, unknown>;
  is_public?: boolean | null;
  is_template?: boolean | null;
  is_submitted_for_review?: boolean;
  has_unseen_changes?: boolean;
  created_at?: string | null;
};

export type SystemWithOwner = SystemModel & {
  owner_email?: string | null;
  owner_name?: string | null;
};

export type RunStep = {
  step_index: number;
  time: number;
  values: Record<string, number>;
};

export type ProgressSummary = {
  user_id: number;
  total_tasks: number;
  completed_tasks: number;
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
};

export type LessonTask = {
  id: number;
  lesson_id: number;
  title: string;
  description: string;
  system_id: number;
  order_index?: number | null;
  created_at?: string | null;
};

export type CompletedTask = {
  task_id: number;
  completed_at: string;
};

export type InboxNotification = {
  id: number;
  recipient_user_id: number;
  sender_user_id: number | null;
  sender_name: string | null;
  system_id: number | null;
  system_title: string | null;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};
