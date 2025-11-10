import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';

import { SurveyService } from './survey.service';

@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  // 활성 설문 목록 조회
  @Get()
  async list() {
    return this.surveyService.listActiveSurveys();
  }

  // 설문 상세 조회
  @Get(':surveyId')
  async findOne(@Param('surveyId', ParseIntPipe) surveyId: number) {
    return this.surveyService.getSurveyDetail(surveyId);
  }

  // 설문 응답 저장
  @Post(':surveyId/responses')
  async createResponse(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() payload: { sessionId?: string; respondent?: string; resumeToken?: string; answers: any[] },
  ) {
    return this.surveyService.createResponse(surveyId, payload);
  }

  // 설문 응답 재개
  @Get(':surveyId/responses/resume/:token')
  async resume(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Param('token') token: string,
  ) {
    return this.surveyService.resumeResponse(surveyId, token);
  }
}

