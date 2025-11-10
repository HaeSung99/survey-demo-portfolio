import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';

import { AdminService } from './admin.service';

@Controller('admin/surveys')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // 설문 목록 조회
  @Get()
  async getAllSurveys() {
    return this.adminService.getAllSurveys();
  }

  // 새 설문 생성
  @Post()
  async createSurvey(
    @Body()
    body: {
      title?: string;
      description?: string | null;
      isActive?: string | boolean;
    },
  ) {
    const isActive =
      body.isActive === undefined
        ? true
        : typeof body.isActive === 'boolean'
          ? body.isActive
          : ['1', 'true', 'on', 'yes', 'Y'].includes(body.isActive);

    return this.adminService.createSurvey({
      title: body.title ?? '',
      description: body.description ?? null,
      isActive,
    });
  }

  // 엑셀로 새 설문 생성
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadNewSurvey(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      title?: string;
      description?: string | null;
      isActive?: string | boolean;
    },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }

    const isActive =
      body.isActive === undefined
        ? true
        : typeof body.isActive === 'boolean'
          ? body.isActive
          : ['1', 'true', 'on', 'yes', 'Y'].includes(body.isActive);

    return this.adminService.createSurveyFromExcel(
      {
        title: body.title ?? '',
        description: body.description ?? null,
        isActive,
      },
      file.buffer,
    );
  }

  // 설문 엑셀 덮어쓰기
  @Post(':surveyId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSurvey(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('엑셀 파일이 필요합니다.');
    }
    console.log('업로드 api 발동')
    return this.adminService.importSurveyFromExcel(surveyId, file.buffer);
  }

  // 설문 JSON 구조 저장
  @Post(':surveyId/structure')
  async updateStructure(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() payload: { questions?: unknown },
  ) {
    return this.adminService.updateSurveyStructure(surveyId, payload as any);
  }

  // 설문 상세 조회
  @Get(':surveyId/detail')
  async getSurveyDetail(@Param('surveyId', ParseIntPipe) surveyId: number) {
    return this.adminService.getSurveyDetail(surveyId);
  }

  // 설문 응답 현황 조회
  @Get(':surveyId/responses')
  async listSurveyResponses(@Param('surveyId', ParseIntPipe) surveyId: number) {
    return this.adminService.listSurveyResponses(surveyId);
  }

  // 설문 기본 정보 수정
  @Patch(':surveyId')
  async updateSurveyMeta(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body()
    body: {
      title?: string;
      description?: string | null;
      isActive?: string | boolean;
    },
  ) {
    const isActive =
      body.isActive === undefined
        ? undefined
        : typeof body.isActive === 'boolean'
          ? body.isActive
          : ['1', 'true', 'on', 'yes', 'Y'].includes(body.isActive);

    return this.adminService.updateSurveyMeta(surveyId, {
      title: body.title,
      description: body.description,
      isActive,
    });
  }

  // 설문 상태 변경
  @Patch(':surveyId/status')
  async updateSurveyStatus(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body('isActive') isActive: boolean,
  ) {
    if (typeof isActive !== 'boolean') {
      throw new BadRequestException('isActive 값이 필요합니다.');
    }
    return this.adminService.updateSurveyStatus(surveyId, isActive);
  }

  // 설문 삭제
  @Delete(':surveyId')
  async deleteSurvey(@Param('surveyId', ParseIntPipe) surveyId: number) {
    await this.adminService.deleteSurvey(surveyId);
    return { success: true };
  }

  // 설문 CSV 다운로드
  @Get(':surveyId/export')
  async exportSurvey(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Res() res: Response,
  ) {
    await this.adminService.exportSurveyToCsv(surveyId, res);
  }

}

