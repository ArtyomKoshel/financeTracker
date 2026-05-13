<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            DB::statement("SELECT setval(pg_get_serial_sequence('goals', 'id'), COALESCE((SELECT MAX(id) FROM goals), 1))");
        }
    }

    public function down(): void
    {
        // Nothing to revert
    }
};
