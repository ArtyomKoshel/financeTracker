<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller as BaseController;
use Illuminate\Http\JsonResponse;

class Controller extends BaseController
{
    protected function clientId(): int
    {
        $id = (int) (app('client_id') ?? auth()->id() ?? 0);
        if ($id <= 0) {
            abort(401, 'Unauthorized');
        }

        return $id;
    }

    protected function success($data = null, int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
        ], $status);
    }

    protected function error(string $message, int $status = 400): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => $message,
        ], $status);
    }
}
