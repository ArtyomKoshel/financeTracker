<?php

namespace App\Providers;

use App\Repositories\TransactionRepository;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Experimental\ImportRuleService;
use App\Services\Experimental\ReceiptMatchingService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        $this->app->bind(TransactionRepositoryInterface::class, TransactionRepository::class);

        $this->app->bind(ImportRuleService::class, function () {
            return new ImportRuleService(auth()->id() ?? 0);
        });

        $this->app->bind(ReceiptMatchingService::class, function () {
            return new ReceiptMatchingService(auth()->id() ?? 0);
        });
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        //
    }
}
