<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaction_splits', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('transaction_id');
            $table->bigInteger('category_id');
            $table->decimal('amount', 15, 2);
            $table->string('description')->nullable();
            $table->timestamps();

            $table->foreign('transaction_id')->references('id')->on('transactions')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
            $table->index('transaction_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_splits');
    }
};
