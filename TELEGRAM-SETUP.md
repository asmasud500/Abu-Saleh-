# Telegram Featured Posts Setup

The portfolio now has a Featured Posts section that reads `posts.json`. A GitHub Action checks Telegram every 5 minutes and commits new text posts into that file.

## Important security step

The bot token you pasted in chat is a credential. Do not put it in HTML, JavaScript, `posts.json`, or any GitHub file. Rotate/revoke that token in BotFather and create a fresh token before enabling the sync.

## Configure the secret

In the private repository, open **Settings → Secrets and variables → Actions → New repository secret**.

Name: `TELEGRAM_BOT_TOKEN`

Value: paste the new token from BotFather.

## Connect the bot

For messages sent directly to the bot, the workflow can read `message` updates.

For posts published in a Telegram channel, add the bot to that channel as an administrator so Telegram can deliver `channel_post` updates.

The workflow runs every 5 minutes and can also be started manually from **Actions → Sync featured posts → Run workflow**.

## Important Telegram note

`getUpdates` cannot be used while a webhook is active. If this bot already has a webhook configured, remove that webhook before using this workflow.

## What appears on the website

New text posts are added to the Featured Posts section automatically. The newest 9 posts are displayed, and the page refreshes its post data every minute.

Images, albums, videos and other media are not downloaded by this first version; text posts are synced safely without exposing the bot credential to website visitors.