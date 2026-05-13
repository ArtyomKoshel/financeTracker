<?php

use App\Http\Controllers\Api\Accounts\AccountController;
use App\Http\Controllers\Api\Accounts\DebtController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\Analytics\AnalyticsController;
use App\Http\Controllers\Api\Analytics\DashboardController;
use App\Http\Controllers\Api\Analytics\ForecastController;
use App\Http\Controllers\Api\Analytics\HealthController;
use App\Http\Controllers\Api\Analytics\RecommendationController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Budget\BudgetController;
use App\Http\Controllers\Api\Budget\CategoryBudgetController;
use App\Http\Controllers\Api\Budget\EnvelopeController;
use App\Http\Controllers\Api\Notes\NoteController;
use App\Http\Controllers\Api\Notifications\PushSubscriptionController;
use App\Http\Controllers\Api\Plans\GoalController;
use App\Http\Controllers\Api\Plans\PaymentController;
use App\Http\Controllers\Api\Shared\BootstrapController;
use App\Http\Controllers\Api\Shared\CategoryController;
use App\Http\Controllers\Api\Shared\IncomeTypeController;
use App\Http\Controllers\Api\Shared\MonthSummaryController;
use App\Http\Controllers\Api\Shared\SearchController;
use App\Http\Controllers\Api\Shared\SettingsController;
use App\Http\Controllers\Api\Shared\TagController;
use App\Http\Controllers\Api\Transactions\TransactionController;
use Illuminate\Support\Facades\Route;
use Symfony\Component\Yaml\Yaml;

Route::get('ping', fn () => response()->json(['ok' => true]));

// API Documentation (OpenAPI/Swagger)
Route::get('openapi.json', function () {
    $yaml = file_get_contents(base_path('docs/openapi.yaml'));
    $spec = Yaml::parse($yaml);

    return response()->json($spec)->header('Content-Type', 'application/json');
});
Route::get('docs', function () {
    return response()->view('api-docs', [
        'specUrl' => url('/api/openapi.json'),
    ]);
});

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware(['jwt.auth', 'audit'])->group(function () {
    Route::post('batch', [\App\Http\Controllers\Api\Transactions\BatchController::class, '__invoke']);
    Route::get('bootstrap', [BootstrapController::class, 'index']);
    Route::get('me', [\App\Http\Controllers\Api\Shared\MeController::class, 'index']);
    Route::get('dashboard', [DashboardController::class, 'index']);
    Route::get('income-recommendation', [BudgetController::class, 'getCashflow']);
    Route::post('budget-plan', [BudgetController::class, 'calculatePlan']);
    Route::get('budget/monthly', [BudgetController::class, 'getMonthly']);
    Route::get('forecast', [ForecastController::class, 'index']);

    Route::get('debts', [DebtController::class, 'index']);
    Route::post('debts', [DebtController::class, 'store']);
    Route::put('debts/{id}', [DebtController::class, 'update'])->whereNumber('id');
    Route::delete('debts/{id}', [DebtController::class, 'destroy'])->whereNumber('id');

    Route::get('envelopes', [EnvelopeController::class, 'index']);
    Route::post('envelopes', [EnvelopeController::class, 'store']);
    Route::put('envelopes/{id}', [EnvelopeController::class, 'update'])->whereNumber('id');
    Route::delete('envelopes/{id}', [EnvelopeController::class, 'destroy'])->whereNumber('id');

    Route::get('transactions', [TransactionController::class, 'index']);
    Route::post('transactions', [TransactionController::class, 'store'])->middleware('throttle:mutations');
    Route::delete('transactions/{id}', [TransactionController::class, 'destroy'])->whereNumber('id')->middleware('throttle:mutations');
    Route::get('transactions/month', [TransactionController::class, 'getByMonth']);
    Route::get('transactions/suggest-category', [TransactionController::class, 'suggestCategory']);
    Route::get('transactions/export', [TransactionController::class, 'export']);
    Route::post('transactions/bulk-delete', [TransactionController::class, 'bulkDelete'])->middleware('throttle:mutations');
    Route::post('transactions/bulk-update', [TransactionController::class, 'bulkUpdate'])->middleware('throttle:mutations');
    Route::post('validate', [TransactionController::class, 'validatePayment']);

    // Transaction Templates
    Route::get('transaction-templates', [\App\Http\Controllers\Api\Transactions\TransactionTemplateController::class, 'index']);
    Route::post('transaction-templates', [\App\Http\Controllers\Api\Transactions\TransactionTemplateController::class, 'store']);
    Route::put('transaction-templates/{id}', [\App\Http\Controllers\Api\Transactions\TransactionTemplateController::class, 'update'])->whereNumber('id');
    Route::delete('transaction-templates/{id}', [\App\Http\Controllers\Api\Transactions\TransactionTemplateController::class, 'destroy'])->whereNumber('id');

    Route::get('month-summary', [MonthSummaryController::class, 'index']);

    Route::get('reports/monthly', [\App\Http\Controllers\Api\Shared\ReportController::class, 'monthly']);
    Route::get('tax', [\App\Http\Controllers\Api\Shared\TaxController::class, 'summary']);
    Route::post('email-parse', [\App\Http\Controllers\Api\Ai\EmailParseController::class, 'parse']);

    Route::get('categories', [CategoryController::class, 'index']);
    Route::post('categories', [CategoryController::class, 'store']);
    Route::put('categories/{id}', [CategoryController::class, 'update'])->whereNumber('id');
    Route::delete('categories/{id}', [CategoryController::class, 'delete'])->whereNumber('id');
    Route::post('categories/restore', [CategoryController::class, 'restore']);

    Route::get('ai/usage', [\App\Http\Controllers\Api\Ai\AiUsageController::class, 'index']);
    Route::post('ai/usage/refresh', [\App\Http\Controllers\Api\Ai\AiUsageController::class, 'refresh']);
    Route::get('settings', [SettingsController::class, 'index']);
    Route::post('settings', [SettingsController::class, 'update']);
    Route::get('rates', [SettingsController::class, 'getRates']);
    Route::get('rates/at-date', [SettingsController::class, 'getRatesAtDate']);
    Route::post('rates/update', [SettingsController::class, 'updateRates']);

    Route::get('payments', [PaymentController::class, 'index']);
    Route::post('payments', [PaymentController::class, 'store']);
    Route::put('payments/{id}', [PaymentController::class, 'update'])->whereNumber('id');
    Route::delete('payments/{id}', [PaymentController::class, 'destroy'])->whereNumber('id');
    Route::get('payments/reminders', [PaymentController::class, 'getReminders']);
    Route::get('payments/subscription-reminders', [PaymentController::class, 'getSubscriptionReminders']);
    Route::get('payments/calendar', [PaymentController::class, 'getCalendar']);
    Route::get('payments/detect-subscriptions', [PaymentController::class, 'detectSubscriptions']);

    Route::get('push/vapid', [PushSubscriptionController::class, 'vapidPublic']);
    Route::post('push/subscribe', [PushSubscriptionController::class, 'store']);
    Route::post('push/unsubscribe', [PushSubscriptionController::class, 'destroy']);

    Route::get('balance', [AccountController::class, 'getBalance']);
    Route::post('balance', [AccountController::class, 'setInitialBalance']);
    Route::post('balance/sync', [AccountController::class, 'syncBalance']);

    Route::get('accounts', [AccountController::class, 'index']);
    Route::post('accounts', [AccountController::class, 'store']);
    Route::put('accounts/{id}', [AccountController::class, 'update'])->whereNumber('id');
    Route::delete('accounts/{id}', [AccountController::class, 'destroy'])->whereNumber('id');

    Route::get('goals', [GoalController::class, 'index']);
    Route::get('goals/completed', [GoalController::class, 'completed']);
    Route::get('goals/savings-plan', [GoalController::class, 'savingsPlan']);
    Route::post('goals', [GoalController::class, 'store']);
    Route::put('goals/{id}', [GoalController::class, 'update'])->whereNumber('id');
    Route::delete('goals/{id}', [GoalController::class, 'destroy'])->whereNumber('id');

    Route::get('budgets', [CategoryBudgetController::class, 'index']);
    Route::post('budgets', [CategoryBudgetController::class, 'store']);
    Route::delete('budgets/{id}', [CategoryBudgetController::class, 'destroy'])->whereNumber('id');
    Route::post('budgets/copy', [CategoryBudgetController::class, 'copyToNextMonth']);

    Route::get('tags', [TagController::class, 'index']);
    Route::post('tags', [TagController::class, 'store']);
    Route::delete('tags/{id}', [TagController::class, 'destroy']);
    Route::post('transactions/{id}/tags', [TagController::class, 'syncTransaction']);

    Route::get('analytics', [AnalyticsController::class, 'index']);
    Route::get('analytics/by-category', [AnalyticsController::class, 'getByCategory']);
    Route::get('analytics/year', [AnalyticsController::class, 'getYearly']);
    Route::get('analytics/compare', [AnalyticsController::class, 'compareMonths']);
    Route::get('analytics/trends', [AnalyticsController::class, 'getCategoryTrend']);
    Route::get('analytics/yoy', [AnalyticsController::class, 'yearOverYear']);
    Route::get('analytics/velocity', [AnalyticsController::class, 'spendingVelocity']);
    Route::get('analytics/top-growth', [AnalyticsController::class, 'topGrowth']);

    Route::get('health', [HealthController::class, 'index']);
    Route::get('health/net-worth-history', [HealthController::class, 'netWorthHistory']);

    Route::get('recommendations', [RecommendationController::class, 'index']);

    Route::get('income-types', [IncomeTypeController::class, 'index']);
    Route::post('income-types', [IncomeTypeController::class, 'store']);
    Route::put('income-types/{id}', [IncomeTypeController::class, 'update'])->whereNumber('id');
    Route::delete('income-types/{id}', [IncomeTypeController::class, 'destroy'])->whereNumber('id');

    Route::get('search', SearchController::class);

    Route::post('settings/telegram-link-code', [SettingsController::class, 'generateTelegramCode']);
    Route::delete('settings/telegram-link', [SettingsController::class, 'unlinkTelegram']);
    Route::get('settings/telegram-status', [SettingsController::class, 'telegramStatus']);
});

Route::middleware(['jwt.auth', 'experimental:notes'])
    ->prefix('notes')
    ->group(function () {
        Route::get('/', [NoteController::class, 'index']);
        Route::post('/', [NoteController::class, 'store']);
        Route::post('/format', [NoteController::class, 'format']);
        Route::post('/suggest', [NoteController::class, 'suggest']);
        Route::post('/reorder', [NoteController::class, 'reorder']);
        Route::get('/{id}', [NoteController::class, 'show'])->whereNumber('id');
        Route::put('/{id}', [NoteController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [NoteController::class, 'destroy'])->whereNumber('id');
        Route::post('/{id}/analyze', [NoteController::class, 'analyze'])->whereNumber('id');
        Route::post('/{id}/append', [NoteController::class, 'append'])->whereNumber('id');
        Route::post('/{id}/pin', [NoteController::class, 'togglePin'])->whereNumber('id');

        Route::get('/folders', [\App\Http\Controllers\Api\Notes\NoteFolderController::class, 'index']);
        Route::post('/folders', [\App\Http\Controllers\Api\Notes\NoteFolderController::class, 'store']);
        Route::post('/folders/reorder', [\App\Http\Controllers\Api\Notes\NoteFolderController::class, 'reorder']);
        Route::put('/folders/{id}', [\App\Http\Controllers\Api\Notes\NoteFolderController::class, 'update'])->whereNumber('id');
        Route::delete('/folders/{id}', [\App\Http\Controllers\Api\Notes\NoteFolderController::class, 'destroy'])->whereNumber('id');

        Route::get('/labels', [\App\Http\Controllers\Api\Notes\NoteLabelController::class, 'index']);
        Route::post('/labels', [\App\Http\Controllers\Api\Notes\NoteLabelController::class, 'store']);
        Route::put('/labels/{id}', [\App\Http\Controllers\Api\Notes\NoteLabelController::class, 'update'])->whereNumber('id');
        Route::delete('/labels/{id}', [\App\Http\Controllers\Api\Notes\NoteLabelController::class, 'destroy'])->whereNumber('id');
    });

Route::middleware(['jwt.auth', 'experimental:calendar'])
    ->prefix('calendar')
    ->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\Calendar\CalendarController::class, 'index']);
        Route::post('/', [\App\Http\Controllers\Api\Calendar\CalendarController::class, 'store']);
        Route::put('/{id}', [\App\Http\Controllers\Api\Calendar\CalendarController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [\App\Http\Controllers\Api\Calendar\CalendarController::class, 'destroy'])->whereNumber('id');
        Route::post('/parse', [\App\Http\Controllers\Api\Calendar\CalendarController::class, 'parse']);
    });

Route::middleware(['jwt.auth', 'experimental:bank_receipt_import'])
    ->prefix('experimental/bank-receipts')
    ->group(function () {
        Route::post('preview', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'preview']);
        Route::post('preview-csv', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'previewCsv']);
        Route::post('apply', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'apply']);
        Route::post('preview-summary', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'previewSummary']);
        Route::get('mappings', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'getMappings']);
        Route::get('imports', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'getImports']);
        Route::delete('imports/{id}', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'deleteImport'])->whereNumber('id');
        Route::get('rules', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'getRules']);
        Route::post('rules', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'storeRule']);
        Route::put('rules/{id}', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'updateRule'])->whereNumber('id');
        Route::delete('rules/{id}', [\App\Http\Controllers\Api\Experimental\BankReceiptController::class, 'deleteRule'])->whereNumber('id');
    });

Route::middleware(['jwt.auth', 'admin', 'throttle:admin', 'audit'])->prefix('admin')->group(function () {
    Route::get('dashboard', [AdminController::class, 'dashboard']);
    Route::get('categorization-rules', [\App\Http\Controllers\Api\Admin\AdminCategorizationRuleController::class, 'index']);
    Route::get('categorization-rules/candidates', [\App\Http\Controllers\Api\Admin\AdminCategorizationRuleController::class, 'candidates']);
    Route::get('categorization-rules/{id}/stats', [\App\Http\Controllers\Api\Admin\AdminCategorizationRuleController::class, 'stats'])->whereNumber('id');
    Route::post('categorization-rules', [\App\Http\Controllers\Api\Admin\AdminCategorizationRuleController::class, 'store']);
    Route::put('categorization-rules/{id}', [\App\Http\Controllers\Api\Admin\AdminCategorizationRuleController::class, 'update'])->whereNumber('id');
    Route::delete('categorization-rules/{id}', [\App\Http\Controllers\Api\Admin\AdminCategorizationRuleController::class, 'destroy'])->whereNumber('id');
    Route::post('push/send', [\App\Http\Controllers\Api\Admin\AdminPushController::class, 'send']);
    Route::get('push/campaigns', [\App\Http\Controllers\Api\Admin\AdminPushController::class, 'campaigns']);
    Route::post('push/campaigns', [\App\Http\Controllers\Api\Admin\AdminPushController::class, 'createCampaign']);
    Route::get('charts', [AdminController::class, 'charts']);
    Route::get('me', [AdminController::class, 'me']);
    Route::get('external-api-logs', [AdminController::class, 'externalApiLogs']);
    Route::get('activity-logs', [AdminController::class, 'activityLogs']);
    Route::get('bank-receipt-stats', [AdminController::class, 'bankReceiptStats']);
    Route::get('ai-metrics', [AdminController::class, 'aiMetrics']);
    Route::get('top-mappings', [AdminController::class, 'topMappings']);
    Route::get('clients', [AdminController::class, 'listClients']);
    Route::post('clients', [AdminController::class, 'createClient']);
    Route::get('clients/{id}', [AdminController::class, 'getClient']);
    Route::put('clients/{id}', [AdminController::class, 'updateClient']);
    Route::post('clients/{id}/impersonate', [AdminController::class, 'impersonate']);
});
