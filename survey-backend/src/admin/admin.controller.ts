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
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Express, Response } from 'express';

import { AdminService } from './admin.service';

@ApiTags('Admin Surveys')
@Controller('admin/surveys')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // 설문 목록 조회
  @Get()
  @ApiOperation({ summary: '설문 목록 조회', description: '관리자가 등록한 모든 설문을 조회합니다.' })
  @ApiResponse({ status: 200, description: '설문 목록 반환.' })
  async getAllSurveys() {
    return this.adminService.getAllSurveys();
  }

  // 새 설문 생성
  @Post()
  @ApiOperation({ summary: '설문 생성', description: '새로운 설문 메타 정보를 생성합니다.' })
  @ApiResponse({ status: 201, description: '생성된 설문 정보.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: '2025 고객 만족도 조사' },
        description: { type: 'string', nullable: true },
        isActive: {
          oneOf: [
            { type: 'boolean', example: true },
            { type: 'string', example: 'true' },
          ],
          description: 'true/false 또는 boolean 값',
        },
      },
    },
  })
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
  @ApiOperation({ summary: '엑셀 업로드로 설문 생성', description: '엑셀 파일을 업로드하여 설문을 생성합니다.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '설문 구조가 정의된 엑셀 파일' },
        title: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
        isActive: {
          oneOf: [
            { type: 'boolean', example: true },
            { type: 'string', example: 'true' },
          ],
          description: 'true/false 또는 boolean 값',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: '엑셀로부터 생성된 설문 정보.' })
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
  @ApiOperation({ summary: '설문 엑셀 덮어쓰기', description: '기존 설문을 업로드한 엑셀로 덮어씁니다.' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'surveyId', type: Number, description: '수정할 설문 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: '업데이트된 설문 구조.' })
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
  @ApiOperation({ summary: '설문 구조 저장', description: '설문 JSON 구조를 저장합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '저장된 설문 구조.' })
  async updateStructure(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Body() payload: { questions?: unknown },
  ) {
    return this.adminService.updateSurveyStructure(surveyId, payload as any);
  }

  // 설문 상세 조회
  @Get(':surveyId/detail')
  @ApiOperation({ summary: '설문 상세 조회', description: '설문 메타 정보 및 구조를 상세 조회합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '설문 상세 데이터.' })
  async getSurveyDetail(@Param('surveyId', ParseIntPipe) surveyId: number) {
    return this.adminService.getSurveyDetail(surveyId);
  }

  // 설문 응답 현황 조회
  @Get(':surveyId/responses')
  @ApiOperation({ summary: '응답 현황 조회', description: '설문별 응답 현황 및 응답 리스트를 조회합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '응답 현황 데이터.' })
  async listSurveyResponses(@Param('surveyId', ParseIntPipe) surveyId: number) {
    return this.adminService.listSurveyResponses(surveyId);
  }

  // 설문 기본 정보 수정
  @Patch(':surveyId')
  @ApiOperation({ summary: '설문 기본 정보 수정', description: '제목, 설명, 활성 상태 등을 수정합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '수정된 설문 정보.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
        isActive: {
          oneOf: [
            { type: 'boolean', example: true },
            { type: 'string', example: 'true' },
          ],
          nullable: true,
          description: 'true/false 또는 boolean 값',
        },
      },
    },
  })
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
  @ApiOperation({ summary: '설문 상태 변경', description: '설문의 활성/비활성 상태를 토글합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '업데이트 결과.' })
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
  @ApiOperation({ summary: '설문 삭제', description: '설문과 관련된 데이터를 삭제합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: '삭제 성공 여부.' })
  async deleteSurvey(@Param('surveyId', ParseIntPipe) surveyId: number) {
    await this.adminService.deleteSurvey(surveyId);
    return { success: true };
  }

  // 설문 CSV 다운로드
  @Get(':surveyId/export')
  @ApiOperation({ summary: '설문 CSV 다운로드', description: '설문을 CSV 파일로 다운로드합니다.' })
  @ApiParam({ name: 'surveyId', type: Number })
  @ApiResponse({ status: 200, description: 'CSV 파일 스트림.' })
  async exportSurvey(
    @Param('surveyId', ParseIntPipe) surveyId: number,
    @Res() res: Response,
  ) {
    await this.adminService.exportSurveyToCsv(surveyId, res);
  }

}

