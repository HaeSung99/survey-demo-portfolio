import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SurveyService } from './survey.service';

@ApiTags('Surveys')
@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  // 활성 설문 목록 조회
  @Get()
  @ApiOperation({ summary: '활성 설문 목록', description: '응답자가 참여할 수 있는 활성 설문 목록을 조회합니다.' })
  @ApiResponse({ status: 200, description: '활성화된 설문 목록 조회' })
  async list() {
    return this.surveyService.listActiveSurveys();
  }

  // 설문 상세 조회
  @Get(':surveyId')
  @ApiOperation({ summary: '설문 상세', description: '특정 설문의 상세 구조를 조회합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '설문 상세 정보 조회' })
  async findOne(@Param('surveyId', ParseIntPipe) surveyId: number) {
    return this.surveyService.getSurveyDetail(surveyId);
  }

  // 설문 응답 저장
  @Post(':surveyId/responses')
  @ApiOperation({ summary: '응답 저장', description: '설문 응답을 저장하고 이어하기 토큰을 반환합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', nullable: true },
        respondent: { type: 'string', nullable: true },
        resumeToken: { type: 'string', nullable: true },
        answers: { type: 'array', items: { type: 'object' } },
      },
      required: ['answers'],
    },
  })
  @ApiResponse({ status: 201, description: '저장된 응답 정보 또는 토큰.' })
  async createResponse(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() payload: { sessionId?: string; respondent?: string; resumeToken?: string; answers: any[] },
  ) {
    return this.surveyService.createResponse(surveyId, payload);
  }

  // 설문 응답 재개
  @Get(':surveyId/responses/resume/:token')
  @ApiOperation({ summary: '응답 재개', description: '이어하기 토큰으로 저장된 응답을 불러옵니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiParam({ name: 'token', type: String, description: '이어하기 토큰을 통해 응답 재개' })
  @ApiResponse({ status: 200, description: '저장된 응답 데이터' })
  async resume(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Param('token') token: string,
  ) {
    return this.surveyService.resumeResponse(surveyId, token);
  }
}

