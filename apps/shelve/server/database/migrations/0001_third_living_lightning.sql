DROP INDEX `github_app_slug_unique`;--> statement-breakpoint
ALTER TABLE `github_app` ADD `installationId` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_installationId_unique` ON `github_app` (`installationId`);--> statement-breakpoint
ALTER TABLE `github_app` DROP COLUMN `slug`;--> statement-breakpoint
ALTER TABLE `github_app` DROP COLUMN `appId`;--> statement-breakpoint
ALTER TABLE `github_app` DROP COLUMN `privateKey`;--> statement-breakpoint
ALTER TABLE `github_app` DROP COLUMN `webhookSecret`;--> statement-breakpoint
ALTER TABLE `github_app` DROP COLUMN `clientId`;--> statement-breakpoint
ALTER TABLE `github_app` DROP COLUMN `clientSecret`;