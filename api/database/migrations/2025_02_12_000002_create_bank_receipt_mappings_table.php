<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_receipt_mappings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('bank_merchant_name', 255);
            $table->string('bank_merchant_normalized', 255)->nullable();
            $table->unsignedBigInteger('category_id');
            $table->enum('confidence', ['learned', 'mapped', 'manual'])->default('mapped');
            $table->unsignedBigInteger('source_transaction_id')->nullable();
            $table->timestamps();

            $table->unique(['client_id', 'bank_merchant_normalized']);
            $table->index('client_id');
            $table->index('bank_merchant_normalized');
            $table->foreign('client_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('category_id')->references('id')->on('categories')->onDelete('cascade');
            $table->foreign('source_transaction_id')->references('id')->on('transactions')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_receipt_mappings');
    }
};
