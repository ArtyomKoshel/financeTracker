<?php

namespace App\Http\Controllers\Api\Plans;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Payments\StorePaymentRequest;
use App\Http\Requests\Payments\UpdatePaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\ActivityLog;
use App\Models\RecurringPayment;
use App\Services\Plans\PaymentService;
use App\Services\Plans\SubscriptionDetectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    protected PaymentService $paymentService;

    protected SubscriptionDetectionService $subscriptionDetection;

    public function __construct(PaymentService $paymentService, SubscriptionDetectionService $subscriptionDetection)
    {
        $this->paymentService = $paymentService;
        $this->subscriptionDetection = $subscriptionDetection;
    }

    public function index(): JsonResponse
    {
        $payments = RecurringPayment::where('is_active', true)->orderBy('day_of_month')->get();

        return $this->success(PaymentResource::collection($payments)->resolve());
    }

    public function store(StorePaymentRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $isOneTime = (bool) $request->input('is_one_time');
        $dueDate = $request->input('due_date');
        $dayOfMonth = $request->input('day_of_month');
        if ($isOneTime && $dueDate) {
            $dayOfMonth = (int) date('j', strtotime($dueDate));
        } elseif ($dayOfMonth === null || $dayOfMonth < 1) {
            $dayOfMonth = 1;
        }
        $p = RecurringPayment::create([
            'client_id' => $clientId,
            'name' => $request->input('name'),
            'amount' => $request->input('amount'),
            'original_amount' => $request->input('amount'),
            'currency' => $request->input('currency', 'BYN'),
            'day_of_month' => $dayOfMonth,
            'due_date' => $isOneTime && $dueDate ? $dueDate : null,
            'category' => $request->input('category', 'essential'),
            'category_id' => $request->input('category_id'),
            'is_variable' => (bool) $request->input('is_variable'),
            'is_one_time' => $isOneTime,
            'is_subscription' => (bool) $request->input('is_subscription'),
            'is_auto_debit' => (bool) $request->input('is_auto_debit'),
            'cancel_by_date' => $request->input('cancel_by_date'),
            'is_income' => (bool) $request->input('is_income'),
            'description' => $request->input('description'),
        ]);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'payment_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['payment_id' => $p->id, 'name' => $p->name, 'amount' => (float) $p->amount],
            'created_at' => now(),
        ]);
        event(new DataUpdated('payments'));

        return $this->success((new PaymentResource($p))->resolve());
    }

    public function update(UpdatePaymentRequest $request, int $id): JsonResponse
    {
        $p = RecurringPayment::findOrFail($id);
        $isOneTime = (bool) $request->input('is_one_time');
        $dueDate = $request->input('due_date');
        $dayOfMonth = $request->input('day_of_month');
        if ($isOneTime && $dueDate) {
            $dayOfMonth = (int) date('j', strtotime($dueDate));
        } elseif ($dayOfMonth === null || $dayOfMonth < 1) {
            $dayOfMonth = $p->day_of_month;
        }
        $data = [
            'name' => $request->input('name'),
            'amount' => $request->input('amount'),
            'original_amount' => $request->input('amount'),
            'day_of_month' => $dayOfMonth,
            'due_date' => $isOneTime && $dueDate ? $dueDate : null,
            'currency' => $request->input('currency', $p->currency),
            'category' => $request->input('category', $p->category),
            'category_id' => $request->has('category_id') ? ($request->input('category_id') ? (int) $request->input('category_id') : null) : $p->category_id,
            'is_variable' => $request->has('is_variable') ? (bool) $request->input('is_variable') : $p->is_variable,
            'is_one_time' => $request->has('is_one_time') ? (bool) $request->input('is_one_time') : $p->is_one_time,
            'is_subscription' => $request->has('is_subscription') ? (bool) $request->input('is_subscription') : $p->is_subscription,
            'is_auto_debit' => $request->has('is_auto_debit') ? (bool) $request->input('is_auto_debit') : $p->is_auto_debit,
            'cancel_by_date' => $request->has('cancel_by_date') ? $request->input('cancel_by_date') : $p->cancel_by_date,
            'is_income' => $request->has('is_income') ? (bool) $request->input('is_income') : $p->is_income,
            'description' => $request->has('description') ? $request->input('description') : $p->description,
        ];
        $p->update($data);
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'payment_update',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['payment_id' => $p->id, 'name' => $p->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('payments'));

        return $this->success((new PaymentResource($p->fresh()))->resolve());
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $p = RecurringPayment::findOrFail($id);
        $p->update(['is_active' => false]);
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'payment_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['payment_id' => $id, 'name' => $p->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('payments'));

        return $this->success(['deleted' => true]);
    }

    public function getReminders(): JsonResponse
    {
        $clientId = $this->clientId();
        $result = $this->paymentService->getReminders($clientId);

        return $this->success($result);
    }

    public function getCalendar(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $from = $request->query('from');
        $to = $request->query('to');
        if ($from && $to) {
            $result = $this->paymentService->getCalendarByRange($clientId, $from, $to);
        } else {
            $days = min(90, max(7, (int) $request->query('days', 60)));
            $result = $this->paymentService->getCalendar($clientId, $days);
        }

        return $this->success($result);
    }

    public function getSubscriptionReminders(): JsonResponse
    {
        $clientId = $this->clientId();
        $result = $this->paymentService->getSubscriptionCancelReminders($clientId);

        return $this->success($result);
    }

    /**
     * Detect potential subscriptions from transaction patterns.
     * GET /api/payments/detect-subscriptions
     */
    public function detectSubscriptions(): JsonResponse
    {
        $clientId = $this->clientId();
        $detected = $this->subscriptionDetection->detectSubscriptions($clientId);

        return $this->success($detected);
    }
}
