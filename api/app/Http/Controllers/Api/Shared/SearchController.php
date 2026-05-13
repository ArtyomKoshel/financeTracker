<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Shared\SearchRequest;
use App\Services\System\SearchService;
use Illuminate\Http\JsonResponse;

class SearchController extends Controller
{
    public function __construct(
        private readonly SearchService $searchService,
    ) {}

    public function __invoke(SearchRequest $request): JsonResponse
    {
        $results = $this->searchService->search(
            $this->clientId(),
            $request->validated('q'),
        );

        return $this->success($results);
    }
}
