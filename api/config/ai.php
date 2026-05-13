<?php

return [
    'default_provider' => env('AI_PROVIDER', 'groq'),

    'providers' => [
        'groq' => [
            'base_url' => 'https://api.groq.com/openai/v1',
            'api_key' => env('GROQ_API_KEY'),
            'model' => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
            'verify_ssl' => env('GROQ_VERIFY_SSL', true),
        ],
        'openai' => [
            'base_url' => 'https://api.openai.com/v1',
            'api_key' => env('OPENAI_API_KEY'),
            'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
        ],
        'anthropic' => [
            'base_url' => 'https://api.anthropic.com/v1',
            'api_key' => env('ANTHROPIC_API_KEY'),
            'model' => env('ANTHROPIC_MODEL', 'claude-haiku-20240307'),
        ],
        'ollama' => [
            'base_url' => env('OLLAMA_BASE_URL', 'http://localhost:11434/v1'),
            'api_key' => 'ollama',
            'model' => env('OLLAMA_MODEL', 'llama3'),
            'verify_ssl' => false,
        ],
    ],
];
