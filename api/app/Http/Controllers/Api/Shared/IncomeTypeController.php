<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Shared\StoreIncomeTypeRequest;
use App\Http\Requests\Shared\UpdateIncomeTypeRequest;
use App\Models\ActivityLog;
use App\Models\IncomeType;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class IncomeTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        IncomeType::seedForClient($this->clientId());

        $types = IncomeType::orderBy('sort_order')->orderBy('label')->get();

        $result = $types->map(function ($t) {
            return [
                'id' => $t->id,
                'code' => $t->code,
                'label' => $t->label,
                'icon' => $t->icon ?? '📦',
                'default_currency' => $t->default_currency ?? 'BYN',
                'sort_order' => $t->sort_order,
                'is_salary_related' => (bool) $t->is_salary_related,
            ];
        });

        return $this->success($result->values()->all());
    }

    public function store(StoreIncomeTypeRequest $request): JsonResponse
    {

        $clientId = $this->clientId();
        $maxOrder = IncomeType::max('sort_order') ?? 0;

        $type = IncomeType::create([
            'client_id' => $clientId,
            'code' => strtolower($request->input('code')),
            'label' => $request->input('label'),
            'icon' => $request->input('icon', '📦'),
            'default_currency' => $request->input('default_currency', 'BYN'),
            'sort_order' => $request->input('sort_order', $maxOrder + 1),
            'is_salary_related' => $request->boolean('is_salary_related'),
        ]);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'income_type_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $type->id, 'label' => $type->label],
            'created_at' => now(),
        ]);
        Cache::forget('income_types:'.$clientId);

        return $this->success([
            'id' => $type->id,
            'code' => $type->code,
            'label' => $type->label,
            'icon' => $type->icon,
            'default_currency' => $type->default_currency,
            'sort_order' => $type->sort_order,
            'is_salary_related' => (bool) $type->is_salary_related,
        ]);
    }

    public function update(UpdateIncomeTypeRequest $request, int $id): JsonResponse
    {
        $type = IncomeType::findOrFail($id);
        $data = array_filter($request->only(['code', 'label', 'icon', 'default_currency', 'sort_order']));
        if ($request->has('is_salary_related')) {
            $data['is_salary_related'] = $request->boolean('is_salary_related');
        }
        $type->update($data);
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'income_type_update',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $type->id, 'label' => $type->label],
            'created_at' => now(),
        ]);
        Cache::forget('income_types:'.$this->clientId());

        return $this->success([
            'id' => $type->id,
            'code' => $type->code,
            'label' => $type->label,
            'icon' => $type->icon,
            'default_currency' => $type->default_currency,
            'sort_order' => $type->sort_order,
            'is_salary_related' => (bool) $type->is_salary_related,
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $type = IncomeType::findOrFail($id);

        $used = Transaction::withoutGlobalScope('client')
            ->where('client_id', $this->clientId())
            ->where('type', $type->code)
            ->exists();

        if ($used) {
            return $this->error('Невозможно удалить: есть транзакции с этим типом', 400);
        }

        $label = $type->label;
        $type->delete();
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'income_type_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $id, 'label' => $label],
            'created_at' => now(),
        ]);
        Cache::forget('income_types:'.$this->clientId());

        return $this->success(['deleted' => true]);
    }
}
