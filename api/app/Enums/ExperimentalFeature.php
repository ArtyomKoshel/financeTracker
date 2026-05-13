<?php

namespace App\Enums;

class ExperimentalFeature
{
    public const BANK_RECEIPT_IMPORT = 'bank_receipt_import';

    public const NOTES = 'notes';

    public const CALENDAR = 'calendar';

    public const TELEGRAM_BOT = 'telegram_bot';

    public const ADVANCED_ANALYTICS = 'advanced_analytics';

    public const AUTO_DEBIT = 'auto_debit';

    public const AUTO_SAVINGS = 'auto_savings';

    public const AI_ANALYSIS = 'ai_analysis';

    public const AI_PROVIDER = 'ai_provider';

    public static function all(): array
    {
        return [
            self::BANK_RECEIPT_IMPORT,
            self::NOTES,
            self::CALENDAR,
            self::TELEGRAM_BOT,
            self::ADVANCED_ANALYTICS,
            self::AUTO_DEBIT,
            self::AUTO_SAVINGS,
            self::AI_ANALYSIS,
            self::AI_PROVIDER,
        ];
    }

    public static function labels(): array
    {
        return [
            self::BANK_RECEIPT_IMPORT => 'Импорт банковских чеков',
            self::NOTES => 'Умные заметки',
            self::CALENDAR => 'Календарь платежей',
            self::TELEGRAM_BOT => 'Telegram бот',
            self::ADVANCED_ANALYTICS => 'Расширенная аналитика',
            self::AUTO_DEBIT => 'Автосписание по платежам',
            self::AUTO_SAVINGS => 'Авто-накопления',
            self::AI_ANALYSIS => 'AI-анализ',
            self::AI_PROVIDER => 'AI-провайдер',
        ];
    }
}
