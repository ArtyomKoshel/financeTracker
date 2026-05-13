<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'groq' => [
        'key' => env('GROQ_API_KEY'),
        'verify_ssl' => env('GROQ_VERIFY_SSL', true),
    ],

    'openai' => [
        'key' => env('OPENAI_API_KEY'),
        'model' => env('OPENAI_VISION_MODEL', 'gpt-4o'),
    ],

    'webpush' => [
        'vapid_public' => env('VAPID_PUBLIC_KEY'),
        'vapid_private' => env('VAPID_PRIVATE_KEY'),
    ],

    'nbrb' => [
        'rates_cache_ttl' => (int) env('RATES_CACHE_TTL', 3600),
    ],

];
