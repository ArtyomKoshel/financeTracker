<?php

use App\Enums\ExperimentalFeature;

return [
    'features' => [
        ExperimentalFeature::BANK_RECEIPT_IMPORT => [
            'name' => 'Загрузка чеков из банкинга',
            'description' => 'Анализ фото чеков и сопоставление с категориями',
        ],
    ],
];
