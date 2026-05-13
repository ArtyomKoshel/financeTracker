<?php

namespace App\Http\Controllers\Api\Transactions;

use App\Http\Controllers\Api\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Batch API: выполнение нескольких запросов одним вызовом.
 * requests: [{ method, path, body? }]
 * path — без /api (например: "transactions?page=1")
 */
class BatchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'requests' => 'required|array|max:10',
            'requests.*.method' => 'required|string|in:GET,POST,PUT,DELETE',
            'requests.*.path' => 'required|string',
            'requests.*.body' => 'nullable|array',
        ]);

        $results = [];
        foreach ($request->input('requests', []) as $req) {
            try {
                $subRequest = Request::create(
                    '/api/'.ltrim($req['path'], '/'),
                    $req['method'],
                    $req['body'] ?? [],
                    $request->cookies->all(),
                    [],
                    array_merge($request->server->all(), [
                        'HTTP_AUTHORIZATION' => $request->header('Authorization'),
                    ])
                );
                $subRequest->headers->replace($request->headers->all());

                $response = app()->handle($subRequest);
                $content = json_decode($response->getContent(), true) ?? [];

                $results[] = [
                    'status' => $response->getStatusCode(),
                    'data' => $content['data'] ?? $content,
                    'error' => $content['error'] ?? null,
                ];
            } catch (\Throwable $e) {
                $results[] = [
                    'status' => 500,
                    'data' => null,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return $this->success(['results' => $results]);
    }
}
