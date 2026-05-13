<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_receipt_imports', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('client_id');
            $table->string('filename', 255)->nullable();
            $table->string('file_hash', 64)->nullable();
            $table->integer('pages_count')->default(0);
            $table->integer('rows_found')->default(0);
            $table->integer('rows_created')->default(0);
            $table->integer('rows_skipped')->default(0);
            $table->timestamps();

            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index('client_id');
            $table->index('file_hash');
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->bigInteger('import_id')->nullable()->after('source');
            $table->foreign('import_id')->references('id')->on('bank_receipt_imports')->nullOnDelete();
            $table->index('import_id');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropForeign(['import_id']);
            $table->dropIndex(['import_id']);
            $table->dropColumn('import_id');
        });

        Schema::dropIfExists('bank_receipt_imports');
    }
};
