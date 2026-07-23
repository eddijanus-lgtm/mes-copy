import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataPointEntity } from '../data-collection/data-point.entity';
import { DowntimeLogEntity } from '../machines/downtime.entity';

@Injectable()
export class TimescaleAggregateService {
  constructor(
    @InjectRepository(DataPointEntity)
    private readonly dataPointRepo: Repository<DataPointEntity>,
    @InjectRepository(DowntimeLogEntity)
    private readonly downtimeRepo: Repository<DowntimeLogEntity>,
  ) {}

  async initializeContinuousAggregates(): Promise<{ success: boolean; details: string[] }> {
    const details: string[] = [];

    try {
      await this.dataPointRepo.query(`
        SELECT create_hypertable('data_points', 'timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE)
      `);
      details.push('Hypertable verified');

      await this.dataPointRepo.query(`
        DO $$
        BEGIN
          IF to_regclass('public.data_points_quality_1min') IS NULL THEN
            EXECUTE '
              CREATE MATERIALIZED VIEW data_points_quality_1min
              WITH (timescaledb.continuous) AS
              SELECT
                time_bucket(''1 minute'', timestamp) AS bucket,
                machine_id,
                node_id,
                AVG(value) AS avg_value,
                MIN(value) AS min_value,
                MAX(value) AS max_value,
                COUNT(*) AS sample_count,
                COUNT(*) FILTER (WHERE quality = ''good'') AS good_count,
                COUNT(*) FILTER (WHERE quality = ''bad'') AS bad_count,
                COUNT(*) FILTER (WHERE quality = ''uncertain'') AS uncertain_count
              FROM data_points
              GROUP BY bucket, machine_id, node_id
              WITH NO DATA
            ';
          END IF;
        END $$;
      `);
      details.push('Continuous Aggregate data_points_quality_1min verified');

      await this.addRefreshPolicyIfMissing();
      details.push('Continuous Aggregate refresh policy verified');

    } catch (error: any) {
      return { success: false, details: [error.message] };
    }

    return { success: true, details };
  }

  async getQualityCountsFromAggregate(start: Date, end: Date): Promise<{ good_count: number; bad_count: number; uncertain_count: number } | null> {
    try {
      const row = await this.dataPointRepo.query(`
        SELECT
          COALESCE(SUM(good_count), 0)::int AS good_count,
          COALESCE(SUM(bad_count), 0)::int AS bad_count,
          COALESCE(SUM(uncertain_count), 0)::int AS uncertain_count
        FROM data_points_quality_1min
        WHERE bucket BETWEEN $1 AND $2
      `, [start, end]);

      return {
        good_count: Number(row?.[0]?.good_count) || 0,
        bad_count: Number(row?.[0]?.bad_count) || 0,
        uncertain_count: Number(row?.[0]?.uncertain_count) || 0,
      };
    } catch (error: any) {
      if (error?.code === '42P01' || error?.code === '0A000') return null;
      throw error;
    }
  }

  async getOeeFromAggregates(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    
    const query = `
      SELECT
        (SUM(good_count)::float / NULLIF(SUM(good_count + bad_count), 0)) * 100 AS quality_pct,
        time_bucket('15 min', bucket) AS interval
      FROM data_points_quality_1min
      WHERE bucket BETWEEN $1 AND $2
      GROUP BY interval
      ORDER BY interval ASC
    `;

    const rows = await this.dataPointRepo.query(query, [range.start, range.end]);
    
    return {
      series: 'oee_aggregate',
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      points: rows.map((r: any) => ({
        timestamp: r.interval,
        quality_pct: parseFloat(r.quality_pct) ?? 0,
      })),
    };
  }

  private resolveRange(from?: string, to?: string) {
    const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date();
    const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - 8 * 60 * 60 * 1000);
    return start <= end ? { start, end } : { start: end, end: start };
  }

  private async addRefreshPolicyIfMissing() {
    try {
      await this.dataPointRepo.query(`
        SELECT add_continuous_aggregate_policy(
          'data_points_quality_1min',
          start_offset => INTERVAL '2 days',
          end_offset => INTERVAL '1 minute',
          schedule_interval => INTERVAL '1 minute',
          if_not_exists => TRUE
        )
      `);
    } catch (error: any) {
      if (error?.code !== '42883') throw error;
    }
  }
}
