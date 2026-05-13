<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaction_templates', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('client_id');
            $table->string('name');
            $table->string('type', 50);
            $table->decimal('amount', 15, 2)->nullable();
            $table->string('currency', 10)->default('BYN');
            $table->bigInteger('category_id')->nullable();
            $table->string('description')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index('client_id');
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_templates');
    }
};
