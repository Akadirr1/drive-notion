CREATE TABLE `drive_files` (
	`file_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`is_folder` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`department_id` text,
	`doc_type` text,
	`created_time` text NOT NULL,
	`modified_time` text NOT NULL,
	`web_view_link` text NOT NULL,
	`trashed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notion_tasks` (
	`page_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`status_group` text NOT NULL,
	`department_id` text,
	`milestone_id` text,
	`due_date` text,
	`blocked` integer DEFAULT 0 NOT NULL,
	`blocker_note` text,
	`is_next` integer DEFAULT 0 NOT NULL,
	`url` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`department_id` text,
	`subject_title` text NOT NULL,
	`detail` text,
	`doc_type` text,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`url` text,
	`occurred_at` text NOT NULL,
	`raw_event_id` integer
);
--> statement-breakpoint
CREATE TABLE `raw_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` text NOT NULL,
	`ingested_at` text NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_events_source_external_id_kind_occurred_at_unique` ON `raw_events` (`source`,`external_id`,`kind`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`seeded` integer DEFAULT 0 NOT NULL,
	`last_success_at` text,
	`last_error` text,
	`last_error_at` text
);
