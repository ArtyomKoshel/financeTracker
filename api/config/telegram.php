<?php

return [
    'bot_token' => env('TELEGRAM_BOT_TOKEN', ''),
    'polling_interval' => (int) env('TELEGRAM_POLL_INTERVAL', 2),
    'link_code_ttl' => (int) env('TELEGRAM_LINK_CODE_TTL', 300),
];
