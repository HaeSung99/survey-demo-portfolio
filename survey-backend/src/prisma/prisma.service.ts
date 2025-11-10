import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // DB 연결 준비
  async onModuleInit() {
    await this.$connect();
  }

  // 종료 훅 등록
  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  // DB 연결 해제
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

