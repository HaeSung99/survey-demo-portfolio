import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  //서버 상태 확인을 위한 헬스 체크 엔드포인트
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
