import { PgBoss, type Job } from 'pg-boss';
import type { QueueProvider, ResearchJobData } from './queue.provider';

const QUEUES = ['research-job'];

export class PgBossQueueProvider implements QueueProvider {
  private boss: PgBoss;

  constructor(connectionString: string) {
    this.boss = new PgBoss(connectionString);
  }

  async enqueue(jobName: string, data: ResearchJobData): Promise<string> {
    const id = await this.boss.send(jobName, data);
    return id!;
  }

  onJob(jobName: string, handler: (data: ResearchJobData, jobId: string) => Promise<void>): void {
    this.boss.work<ResearchJobData>(jobName, async (jobs: Job<ResearchJobData>[]) => {
      for (const job of jobs) {
        await handler(job.data as ResearchJobData, job.id);
      }
    });
  }

  async start(): Promise<void> {
    await this.boss.start();
    for (const queue of QUEUES) {
      await this.boss.createQueue(queue);
    }
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }
}
