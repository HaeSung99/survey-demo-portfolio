import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  //서버 상태 확인을 위한 헬스 체크 엔드포인트
  @Get()
  @ApiOperation({ summary: '헬스 체크', description: '서버가 정상 동작 중인지 확인합니다.' })
  @ApiResponse({ status: 200, description: '서버가 정상적으로 응답할 때 반환하는 인삿말.' })
  getHello(): string {
    return this.appService.getHello();
  }
}
