<?php

namespace App\Http\Controllers\Api;

use App\Models\Account;
use App\Models\ActivityLog;
use App\Models\Transaction;
use App\Models\User;
use App\Models\UserExperimentalFeature;
use App\Services\Admin\AdminUserService;
use App\Services\Auth\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class AdminController extends Controller
{
    public function __construct(
        protected AuthService $authService,
        protected AdminUserService $adminUserService,
    ) {}

    /**
     * Дашборд админа: общая сводка по пользователям и активности.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $totalUsers = User::count();
        $activeUsers = User::where('is_active', true)->count();
        $totalTransactions = Transaction::withoutGlobalScope('client')->count();
        $activeLast7Days = User::where('last_login_at', '>=', now()->subDays(7))->count();
        $newLast30Days = User::where('created_at', '>=', now()->subDays(30))->count();

        $totalBalance = (float) Account::withoutGlobalScope('client')->sum('balance');

        return $this->success([
            'total_users' => $totalUsers,
            'active_users' => $activeUsers,
            'total_transactions' => $totalTransactions,
            'active_last_7_days' => $activeLast7Days,
            'new_last_30_days' => $newLast30Days,
            'total_balance' => $totalBalance,
        ]);
    }

    /**
     * Данные для графиков: рост пользователей и объём операций по месяцам.
     */
    public function charts(Request $request): JsonResponse
    {
        $months = (int) $request->query('months', 6);
        $months = min(24, max(3, $months));

        $labels = [];
        $usersData = [];
        $txData = [];

        for ($i = $months - 1; $i >= 0; $i--) {
            $date = now()->subMonths($i);
            $month = $date->format('Y-m');
            $labels[] = $month;
            $start = $date->copy()->startOfMonth();
            $end = $date->copy()->endOfMonth();
            $usersData[] = User::whereBetween('created_at', [$start, $end])->count();
            $txData[] = Transaction::withoutGlobalScope('client')
                ->whereBetween('created_at', [$start, $end])
                ->count();
        }

        return $this->success([
            'labels' => $labels,
            'users' => $usersData,
            'transactions' => $txData,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $isAdmin = app()->bound('is_admin') ? app('is_admin') : false;
        $userId = auth()->id();

        return $this->success([
            'is_admin' => (bool) $isAdmin,
            'user_id' => $userId,
        ]);
    }

    public function listClients(Request $request): JsonResponse
    {
        $users = User::where('id', '>', 0)->orderBy('id')->get();

        $result = [];
        foreach ($users as $u) {
            $txCount = Transaction::withoutGlobalScope('client')->where('client_id', $u->id)->count();
            $account = Account::withoutGlobalScope('client')->where('client_id', $u->id)->first();
            $result[] = [
                'user' => $this->formatUser($u),
                'transaction_count' => $txCount,
                'balance' => $account ? (float) $account->balance : 0,
            ];
        }

        return $this->success($result);
    }

    public function getClient(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if (! $user) {
            return $this->error('Client not found', 404);
        }

        $txCount = Transaction::withoutGlobalScope('client')->where('client_id', $id)->count();
        $account = Account::withoutGlobalScope('client')->where('client_id', $id)->first();
        $experimentalFeatures = Schema::hasTable('user_experimental_features')
            ? UserExperimentalFeature::getFeaturesForUser($id) : [];

        return $this->success([
            'user' => $this->formatUser($user, $experimentalFeatures),
            'transaction_count' => $txCount,
            'balance' => $account ? (float) $account->balance : 0,
        ]);
    }

    public function createClient(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:4',
            'name' => 'required|string|max:255',
        ]);

        $user = $this->adminUserService->createClient($request->only(['email', 'password', 'name']));

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'admin_client_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['target_id' => $user->id, 'email' => $user->email],
            'created_at' => now(),
        ]);

        return $this->success($this->formatUser($user));
    }

    public function updateClient(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if (! $user) {
            return $this->error('Client not found', 404);
        }

        $currentUserId = auth()->id();
        if ($id === $currentUserId) {
            return $this->error('Нельзя редактировать свой аккаунт через админку', 403);
        }

        $data = $request->validate([
            'email' => 'sometimes|email|unique:users,email,'.$id,
            'password' => 'nullable|string|min:4',
            'name' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
            'experimental_features' => 'nullable|array',
            'experimental_features.*' => 'string|max:50',
        ]);

        if (! empty($data['password'])) {
            $data['password_hash'] = Hash::make($data['password']);
            unset($data['password']);
        }

        $experimentalFeatures = $request->has('experimental_features')
            ? ($data['experimental_features'] ?? [])
            : null;
        unset($data['experimental_features']);

        $user->update($data);

        $featuresForResponse = null;
        if (Schema::hasTable('user_experimental_features')) {
            if ($experimentalFeatures !== null) {
                UserExperimentalFeature::where('user_id', $id)->delete();
                $features = is_array($experimentalFeatures) ? $experimentalFeatures : [];
                $featuresForResponse = [];
                foreach ($features as $code) {
                    if (! empty(trim($code))) {
                        UserExperimentalFeature::create([
                            'user_id' => $id,
                            'feature_code' => trim($code),
                            'granted_by' => auth()->id(),
                            'granted_at' => now(),
                        ]);
                        $featuresForResponse[] = trim($code);
                    }
                }
            } else {
                $featuresForResponse = UserExperimentalFeature::where('user_id', $id)
                    ->pluck('feature_code')
                    ->values()
                    ->all();
            }
        }

        $changeKeys = array_diff(array_keys($data), ['password_hash']);
        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'admin_client_update',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['target_id' => $id, 'email' => $user->email, 'changes' => array_values($changeKeys)],
            'created_at' => now(),
        ]);

        return $this->success($this->formatUser($user->fresh(), $featuresForResponse));
    }

    public function impersonate(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if (! $user || ! $user->is_active) {
            return $this->error('Client not found or inactive', 404);
        }

        if ($id === auth()->id()) {
            return $this->error('Нельзя войти сам в себя', 403);
        }

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'impersonate',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['target_client_id' => $id, 'target_email' => $user->email],
            'created_at' => now(),
        ]);

        // Токен с правами целевого пользователя (is_admin целевого, не админа)
        $token = $this->authService->generateToken($user->id, (bool) $user->is_admin);

        return $this->success(['token' => $token]);
    }

    public function externalApiLogs(Request $request): JsonResponse
    {
        if (! Schema::hasTable('external_api_logs')) {
            return $this->success(['data' => [], 'meta' => [], 'metrics' => []]);
        }

        $perPage = min((int) $request->query('per_page', 50), 200);
        $page = max(1, (int) $request->query('page', 1));
        $clientId = $request->query('client_id');
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');
        $service = $request->query('service');

        $query = DB::table('external_api_logs')->orderByDesc('created_at');

        if ($clientId) {
            $query->where('client_id', $clientId);
        }
        if ($dateFrom) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('created_at', '<=', $dateTo.' 23:59:59');
        }
        if ($service) {
            $query->where('service', $service);
        }

        $total = (clone $query)->count();
        $logs = $query->offset(($page - 1) * $perPage)->limit($perPage)->get()->map(function ($row) {
            return [
                'id' => $row->id,
                'client_id' => $row->client_id,
                'service' => $row->service,
                'endpoint' => $row->endpoint,
                'method' => $row->method,
                'status_code' => $row->status_code,
                'duration_ms' => $row->duration_ms,
                'request_meta' => $row->request_meta ? json_decode($row->request_meta, true) : null,
                'response_meta' => $row->response_meta ? json_decode($row->response_meta, true) : null,
                'error_message' => $row->error_message,
                'created_at' => $row->created_at,
            ];
        });

        $since24h = now()->subDay();
        $metricsQuery = DB::table('external_api_logs')->where('created_at', '>=', $since24h);
        $totalReq = (clone $metricsQuery)->count();
        $successReq = (clone $metricsQuery)->whereBetween('status_code', [200, 299])->count();
        $errorsReq = (clone $metricsQuery)->where(function ($q) {
            $q->whereNull('status_code')->orWhere('status_code', '>=', 400);
        })->count();
        $avgDuration = (clone $metricsQuery)->avg('duration_ms');

        return $this->success([
            'data' => $logs->all(),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => (int) ceil($total / $perPage),
            ],
            'metrics' => [
                'total_24h' => $totalReq,
                'success_24h' => $successReq,
                'errors_24h' => $errorsReq,
                'success_rate_24h' => $totalReq > 0 ? round(($successReq / $totalReq) * 100, 1) : null,
                'avg_duration_ms' => $avgDuration ? (int) round($avgDuration) : null,
            ],
        ]);
    }

    /**
     * Логи активности: входы в систему и др.
     */
    public function activityLogs(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 50), 200);
        $page = max(1, (int) $request->query('page', 1));
        $userId = $request->query('user_id');
        $action = $request->query('action');
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');
        $search = $request->query('search');

        $query = ActivityLog::with('user:id,email,name')->orderByDesc('created_at');

        if ($userId) {
            $query->where('user_id', $userId);
        }
        if ($action) {
            $query->where('action', $action);
        }
        if ($dateFrom) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('created_at', '<=', $dateTo.' 23:59:59');
        }
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('action', 'like', "%{$search}%")
                    ->orWhere('ip', 'like', "%{$search}%")
                    ->orWhere('user_agent', 'like', "%{$search}%")
                    ->orWhere('details', 'like', "%{$search}%");
            });
        }

        $total = (clone $query)->count();
        $logs = $query->offset(($page - 1) * $perPage)->limit($perPage)->get()->map(function (ActivityLog $log) {
            return [
                'id' => $log->id,
                'user_id' => $log->user_id,
                'user_email' => $log->user?->email,
                'user_name' => $log->user?->name,
                'action' => $log->action,
                'ip' => $log->ip,
                'user_agent' => $log->user_agent,
                'details' => $log->details,
                'created_at' => $log->created_at?->format('Y-m-d H:i:s'),
            ];
        });

        $actionTypes = ActivityLog::select('action')
            ->distinct()
            ->orderBy('action')
            ->pluck('action')
            ->all();

        return $this->success([
            'data' => $logs->all(),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => (int) ceil($total / $perPage),
            ],
            'action_types' => $actionTypes,
        ]);
    }

    /**
     * Статистика BankReceipt импортов (#9).
     */
    public function bankReceiptStats(Request $request): JsonResponse
    {
        if (! Schema::hasTable('bank_receipt_imports')) {
            return $this->success([]);
        }

        $days30 = now()->subDays(30);
        $days90 = now()->subDays(90);

        $imports30 = DB::table('bank_receipt_imports')->where('created_at', '>=', $days30)->count();
        $imports90 = DB::table('bank_receipt_imports')->where('created_at', '>=', $days90)->count();
        $txCreated30 = DB::table('bank_receipt_imports')->where('created_at', '>=', $days30)->sum('rows_created');
        $txCreated90 = DB::table('bank_receipt_imports')->where('created_at', '>=', $days90)->sum('rows_created');

        $activeUsers30 = DB::table('bank_receipt_imports')
            ->where('created_at', '>=', $days30)
            ->distinct('client_id')
            ->count('client_id');

        $top5 = DB::table('bank_receipt_imports')
            ->where('created_at', '>=', $days90)
            ->select('client_id', DB::raw('COUNT(*) as imports_count'), DB::raw('SUM(rows_created) as tx_count'))
            ->groupBy('client_id')
            ->orderByDesc('imports_count')
            ->limit(5)
            ->get()
            ->map(function ($row) {
                $user = User::find($row->client_id);

                return [
                    'client_id' => $row->client_id,
                    'email' => $user?->email,
                    'imports_count' => $row->imports_count,
                    'tx_count' => $row->tx_count,
                ];
            });

        return $this->success([
            'imports_30d' => $imports30,
            'imports_90d' => $imports90,
            'tx_created_30d' => (int) $txCreated30,
            'tx_created_90d' => (int) $txCreated90,
            'active_users_30d' => $activeUsers30,
            'top_users_90d' => $top5,
        ]);
    }

    /**
     * AI-метрики из external_api_logs (#10).
     */
    public function aiMetrics(Request $request): JsonResponse
    {
        if (! Schema::hasTable('external_api_logs')) {
            return $this->success([]);
        }

        $days = min((int) $request->query('days', 7), 90);
        $since = now()->subDays($days);

        $rows = DB::table('external_api_logs')
            ->where('created_at', '>=', $since)
            ->whereIn('service', ['groq', 'openai', 'anthropic', 'ollama'])
            ->selectRaw('
                COUNT(*) as total,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status_code IS NULL OR status_code >= 400 THEN 1 ELSE 0 END) as error_count,
                AVG(duration_ms) as avg_duration_ms,
                MAX(duration_ms) as max_duration_ms,
                service
            ')
            ->groupBy('service')
            ->get();

        $total = $rows->sum('total');
        $successCount = $rows->sum('success_count');
        $errorCount = $rows->sum('error_count');
        $avgDuration = $total > 0 ? round($rows->avg('avg_duration_ms'), 0) : 0;
        $maxDuration = $rows->max('max_duration_ms');

        return $this->success([
            'period_days' => $days,
            'total_requests' => $total,
            'success_count' => $successCount,
            'error_count' => $errorCount,
            'success_rate' => $total > 0 ? round(($successCount / $total) * 100, 1) : null,
            'avg_duration_ms' => (int) $avgDuration,
            'max_duration_ms' => $maxDuration,
            'by_service' => $rows->map(fn ($r) => [
                'service' => $r->service,
                'total' => $r->total,
                'success' => $r->success_count,
                'errors' => $r->error_count,
                'avg_ms' => (int) round($r->avg_duration_ms ?? 0),
            ])->values(),
        ]);
    }

    /**
     * Топ маппингов мерчантов (#11).
     */
    public function topMappings(Request $request): JsonResponse
    {
        if (! Schema::hasTable('bank_receipt_mappings')) {
            return $this->success([]);
        }

        $limit = min((int) $request->query('limit', 20), 100);

        $mappings = DB::table('bank_receipt_mappings as m')
            ->leftJoin('categories as c', 'm.category_id', '=', 'c.id')
            ->select(
                'm.bank_merchant_normalized',
                DB::raw('MAX(m.bank_merchant_name) as bank_merchant_name'),
                DB::raw('COUNT(*) as client_count'),
                'm.category_id',
                DB::raw('MAX(c.name) as category_name'),
                DB::raw('COUNT(DISTINCT m.category_id) as category_variants')
            )
            ->groupBy('m.bank_merchant_normalized', 'm.category_id')
            ->orderByDesc('client_count')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'merchant' => $r->bank_merchant_name,
                'merchant_normalized' => $r->bank_merchant_normalized,
                'category_id' => $r->category_id,
                'category_name' => $r->category_name,
                'client_count' => $r->client_count,
                'category_variants' => $r->category_variants,
            ]);

        return $this->success($mappings->values()->all());
    }

    protected function formatUser($u, ?array $experimentalFeatures = null)
    {
        $data = [
            'id' => $u->id,
            'email' => $u->email,
            'name' => $u->name,
            'is_active' => (bool) $u->is_active,
            'is_admin' => (bool) $u->is_admin,
            'last_login_at' => $u->last_login_at ? $u->last_login_at->format('Y-m-d H:i') : null,
            'created_at' => $u->created_at ? $u->created_at->format('Y-m-d H:i') : null,
        ];
        if ($experimentalFeatures !== null && Schema::hasTable('user_experimental_features')) {
            $data['experimental_features'] = $experimentalFeatures;
        }

        return $data;
    }
}
