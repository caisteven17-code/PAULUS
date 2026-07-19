import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class AnalyticsDbService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.ANALYTICS_DB_URL || '';
    if (!connectionString) {
      throw new Error('ANALYTICS_DB_URL is required for the AWS analytics database.');
    }
    const url = new URL(connectionString);
    // Keep node-postgres aligned with libpq/psycopg semantics for sslmode=require.
    url.searchParams.set('uselibpqcompat', 'true');
    this.pool = new Pool({ connectionString: url.toString(), max: 5 });
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, values);
    return result.rows;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
