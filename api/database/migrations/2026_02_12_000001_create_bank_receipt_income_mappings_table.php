<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_receipt_income_mappings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('bank_merchant_name', 255);
            $table->string('bank_merchant_normalized', 255);
            $table->string('income_type', 50); // salary, bonus, advance, etc.
            $table->timestamps();

            $table->unique(['client_id', 'bank_merchant_normalized']);
            $table->index('client_id');
            $table->foreign('client_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_receipt_income_mappings');
    }
};
