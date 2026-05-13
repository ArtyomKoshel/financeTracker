<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<Throwable>>
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed for validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     *
     * @return void
     */
    public function register()
    {
        $this->reportable(function (Throwable $e) {
            Log::error($e->getMessage(), [
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
        });
    }

    /**
     * Render exception as JSON for API requests. Единый формат: { success: false, error: "message" }
     */
    public function render($request, Throwable $e)
    {
        if ($this->isApiRequest($request)) {
            return $this->apiErrorResponse($request, $e);
        }

        return parent::render($request, $e);
    }

    protected function isApiRequest(Request $request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }

    protected function apiErrorResponse(Request $request, Throwable $e): JsonResponse
    {
        $message = 'Ошибка сервера';
        $status = 500;

        if ($e instanceof ValidationException) {
            $status = 422;
            $errors = $e->errors();
            $message = is_array($errors) && ! empty($errors)
                ? implode(' ', array_map(fn ($msgs) => is_array($msgs) ? implode(' ', $msgs) : $msgs, $errors))
                : $e->getMessage();
        } elseif ($e instanceof TooManyRequestsHttpException) {
            $status = 429;
            $message = 'Слишком много запросов. Подождите минуту.';
        } elseif ($e instanceof HttpException) {
            $status = $e->getStatusCode();
            $message = $e->getMessage() ?: $this->defaultMessageForStatus($status);
        } elseif ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
            $status = 404;
            $message = 'Не найдено';
        } elseif (config('app.debug')) {
            $message = $e->getMessage();
        }

        return response()->json([
            'success' => false,
            'error' => $message,
        ], $status);
    }

    protected function defaultMessageForStatus(int $status): string
    {
        return match ($status) {
            400 => 'Некорректный запрос',
            401 => 'Необходима авторизация',
            403 => 'Доступ запрещён',
            404 => 'Не найдено',
            422 => 'Ошибка валидации',
            429 => 'Слишком много запросов',
            default => 'Ошибка сервера',
        };
    }
}
