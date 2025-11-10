import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import type { Survey } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const APP_ENV = process.env.NODE_ENV ?? 'development';
const IS_DEV = APP_ENV !== 'production';

// 엑셀 Questions 시트의 한 행을 표현합니다.
type QuestionRow = {
  question_code: string;
  type?: string;
  text?: string;
  next_question_code?: string | null;
};

// 엑셀 QuestionOptions 시트의 한 행을 표현합니다.
type OptionRow = {
  question_code: string;
  value: string | number;
  label?: string;
  order?: number;
  is_other?: number | string;
  jump_to_question_code?: string | null;
};

// 정규화된 문항 정보입니다.
type NormalizedQuestion = {
  code: string;
  type: string;
  text: string;
  nextQuestionCode: string | null;
};

// 정규화된 선택지 정보입니다.
type NormalizedOption = {
  questionCode: string;
  value: string;
  label: string;
  order: number;
  isOther: boolean;
  jumpToCode: string | null;
};

// 관리자 UI에서 등록되는 선택지 입력 형식입니다.
type UiOptionInput = {
  value?: string;
  label?: string;
  isOther?: boolean;
  jumpToQuestionCode?: string | null;
  order?: number;
};

// 관리자 UI에서 등록되는 문항 입력 형식입니다.
type UiQuestionInput = {
  code?: string;
  type?: string;
  text?: string;
  nextQuestionCode?: string | null;
  options?: UiOptionInput[];
};

// 관리자 UI에서 전달되는 설문 구조 갱신 페이로드입니다.
type SurveyStructurePayload = {
  questions?: UiQuestionInput[];
};

// 응답 수가 포함된 설문 모델입니다.
type SurveyWithCount = Survey & { responsesCount: number };

// 관리자 UI로 반환할 선택지 정보입니다.
type FormattedOption = {
  id: number;
  value: string;
  label: string;
  order: number;
  isOther: boolean;
  jumpToQuestionCode: string | null;
};

// 관리자 UI로 반환할 문항 정보입니다.
type FormattedQuestion = {
  id: number;
  code: string;
  type: string;
  text: string;
  nextQuestionCode: string | null;
  options: FormattedOption[];
};

// Prisma createMany용 선택지 삽입 데이터입니다.
type OptionInsertData = {
  questionId: number;
  value: string;
  label: string;
  order: number;
  isOther: boolean;
  jumpToQuestionId: number | null;
};

// 새 설문 생성 입력입니다.
type CreateSurveyPayload = {
  title: string;
  description?: string | null;
  isActive?: boolean;
};

// 설문 기본 정보 수정 입력입니다.
type UpdateSurveyMetaPayload = {
  title?: string;
  description?: string | null;
  isActive?: boolean;
};

// 응답 상태 계산을 위한 문항 정보입니다.
type StatusQuestion = {
  id: number;
  code: string;
  type: string;
  nextQuestionId: number | null;
  options: Array<{
    value: string;
    jumpTarget: { id: number; code: string } | null;
  }>;
};

// 관리자에게 제공할 응답 요약 정보입니다.
type ResponseSummary = {
  id: number;
  resumeToken: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  lastQuestionCode: string | null;
  nextQuestionCode: string | null;
  updatedAt: Date;
  lastAnsweredAt: Date | null;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // 설문 목록 조회
  async getAllSurveys() {
    const surveys = await this.prisma.survey.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const countPromises: Promise<number>[] = [];
    for (const survey of surveys) {
      countPromises.push(
        this.prisma.response.count({
          where: { surveyId: survey.id },
        }),
      );
    }

    const responseCounts = await Promise.all(countPromises);
    const result: SurveyWithCount[] = [];
    for (let index = 0; index < surveys.length; index += 1) {
      result.push({
        ...surveys[index],
        responsesCount: responseCounts[index],
      });
    }

    if (IS_DEV) {
      console.log('[AdminService] getAllSurveys 결과', result);
    }

    return result;
  }

  // 설문 상세 조회
  async getSurveyDetail(surveyId: number) {
    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        questions: {
          orderBy: { id: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              include: {
                jumpTarget: {
                  select: { id: true, code: true },
                },
              },
            },
          },
        },
      },
    });

    if (!survey) {
      throw new NotFoundException('설문을 찾을 수 없습니다.');
    }

    const responsesCount = await this.prisma.response.count({
      where: { surveyId },
    });

    const codeById = new Map<number, string>();
    survey.questions.forEach((question) => codeById.set(question.id, question.code));

    const formattedQuestions: FormattedQuestion[] = [];

    for (const question of survey.questions) {
      const formattedOptions: FormattedOption[] = [];

      for (const option of question.options) {
        formattedOptions.push({
          id: option.id,
          value: option.value,
          label: option.label,
          order: option.order,
          isOther: option.isOther,
          jumpToQuestionCode: option.jumpToQuestionId ? option.jumpTarget?.code ?? null : null,
        });
      }

      formattedQuestions.push({
        id: question.id,
        code: question.code,
        type: question.type,
        text: question.text,
        nextQuestionCode: question.nextQuestionId ? codeById.get(question.nextQuestionId) ?? null : null,
        options: formattedOptions,
      });
    }

    const detail = {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      isActive: survey.isActive,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
      responsesCount,
      questions: formattedQuestions,
    };

    if (IS_DEV) {
      console.log('[AdminService] getSurveyDetail 결과', detail);
    }

    return detail;
  }

  // 새 설문 생성
  async createSurvey(payload: CreateSurveyPayload) {
    const title = payload.title?.trim();
    if (!title) {
      throw new BadRequestException('설문 제목은 필수입니다.');
    }

    const survey = await this.prisma.survey.create({
      data: {
        title,
        description: payload.description?.trim() || null,
        isActive: payload.isActive ?? true,
      },
    });

    const created = {
      ...survey,
      responsesCount: 0,
    };

    if (IS_DEV) {
      console.log('[AdminService] createSurvey 결과', created);
    }

    return created;
  }

  // 설문 기본 정보 수정
  async updateSurveyMeta(surveyId: number, payload: UpdateSurveyMetaPayload) {
    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new NotFoundException('설문을 찾을 수 없습니다.');
    }

    const title = payload.title != null ? payload.title.trim() : survey.title;
    if (!title) {
      throw new BadRequestException('설문 제목은 비울 수 없습니다.');
    }

    const updated = await this.prisma.survey.update({
      where: { id: surveyId },
      data: {
        title,
        description:
          payload.description !== undefined
            ? payload.description?.trim() || null
            : survey.description,
        isActive: payload.isActive ?? survey.isActive,
      },
      include: {
        _count: {
          select: { responses: true },
        },
      },
    });

    const { _count, ...rest } = updated;
    const result = {
      ...rest,
      responsesCount: _count.responses,
    };

    if (IS_DEV) {
      console.log('[AdminService] updateSurveyMeta 결과', result);
    }

    return result;
  }

  // 설문 응답 현황 조회
  async listSurveyResponses(surveyId: number) {
    const questions = await this.prisma.question.findMany({
      where: { surveyId },
      orderBy: { id: 'asc' },
      include: {
        options: {
          orderBy: { order: 'asc' },
          include: {
            jumpTarget: {
              select: { id: true, code: true },
            },
          },
        },
      },
    });

    const questionList: StatusQuestion[] = [];
    for (const question of questions) {
      questionList.push({
        id: question.id,
        code: question.code,
        type: question.type,
        nextQuestionId: question.nextQuestionId,
        options: question.options.map((option) => ({
          value: option.value,
          jumpTarget: option.jumpTarget
            ? { id: option.jumpTarget.id, code: option.jumpTarget.code }
            : null,
        })),
      });
    }

    const findQuestionById = (id: number) =>
      questionList.find((question) => question.id === id) ?? null;

    const responses = await this.prisma.response.findMany({
      where: { surveyId },
      orderBy: { updatedAt: 'desc' },
      include: {
        answers: {
          orderBy: { answeredAt: 'desc' },
          include: {
            question: {
              select: { id: true, code: true },
            },
          },
        },
      },
    });

    const summaries: ResponseSummary[] = [];

    for (const response of responses) {
      const latestAnswer = response.answers[0] ?? null;
      let status: ResponseSummary['status'] = response.answers.length ? 'COMPLETED' : 'NOT_STARTED';
      let lastQuestionCode: string | null = latestAnswer?.question?.code ?? null;
      let nextQuestionCode: string | null = null;
      let lastAnsweredAt: Date | null = latestAnswer?.answeredAt ?? null;

      if (latestAnswer?.question?.id) {
        const targetQuestion = findQuestionById(latestAnswer.question.id);
        if (targetQuestion) {
          const parsedValues = this.parseOptionValuesJson(latestAnswer.optionValuesJson);
          nextQuestionCode = this.resolveNextQuestionCodeForStatus(
            targetQuestion,
            {
              optionValue: latestAnswer.optionValue ?? undefined,
              optionValues: parsedValues.length ? parsedValues : undefined,
              otherText: latestAnswer.otherText ?? undefined,
            },
            findQuestionById,
          );
          status = nextQuestionCode ? 'IN_PROGRESS' : 'COMPLETED';
        }
      }

      summaries.push({
        id: response.id,
        resumeToken: response.resumeToken,
        status,
        lastQuestionCode,
        nextQuestionCode,
        updatedAt: response.updatedAt,
        lastAnsweredAt,
      });
    }

    if (IS_DEV) {
      console.log('[AdminService] listSurveyResponses 결과', { surveyId, count: summaries.length });
    }

    return summaries;
  }

  // 설문 상태 변경
  async updateSurveyStatus(surveyId: number, isActive: boolean) {
    const result = await this.updateSurveyMeta(surveyId, { isActive });
    if (IS_DEV) {
      console.log('[AdminService] updateSurveyStatus 결과', result);
    }
    return result;
  }

  // 설문 삭제
  async deleteSurvey(surveyId: number) {
    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new NotFoundException('설문을 찾을 수 없습니다.');
    }

    await this.prisma.survey.delete({
      where: { id: surveyId },
    });

    if (IS_DEV) {
      console.log('[AdminService] deleteSurvey 완료', { surveyId });
    }
  }

  // 엑셀로 새 설문 생성
  async createSurveyFromExcel(meta: CreateSurveyPayload, fileBuffer: Buffer) {
    const title = meta.title?.trim();
    if (!title) {
      throw new BadRequestException('설문 제목은 필수입니다.');
    }

    const { questionRows, optionRows } = this.parseWorkbook(fileBuffer);
    const normalizedQuestions = this.normalizeQuestionsFromRows(questionRows);
    const normalizedOptions = this.normalizeOptionsFromRows(optionRows);

    const survey = await this.prisma.survey.create({
      data: {
        title,
        description: meta.description?.trim() || null,
        isActive: meta.isActive ?? true,
      },
    });

    const stats = await this.replaceSurveyStructure(
      survey.id,
      normalizedQuestions,
      normalizedOptions,
    );

    const result = {
      ...survey,
      responsesCount: 0,
      ...stats,
    };

    if (IS_DEV) {
      console.log('[AdminService] createSurveyFromExcel 결과', result);
    }

    return result;
  }

  // 엑셀로 설문 구조 덮어쓰기
  async importSurveyFromExcel(surveyId: number, fileBuffer: Buffer) {
    const { questionRows, optionRows } = this.parseWorkbook(fileBuffer);
    const normalizedQuestions = this.normalizeQuestionsFromRows(questionRows);
    const normalizedOptions = this.normalizeOptionsFromRows(optionRows);
    const result = await this.replaceSurveyStructure(
      surveyId,
      normalizedQuestions,
      normalizedOptions,
    );
    if (IS_DEV) {
      console.log('[AdminService] importSurveyFromExcel 결과', { surveyId, result });
    }
    return result;
  }

  // JSON 구조로 설문 덮어쓰기
  async updateSurveyStructure(surveyId: number, payload: SurveyStructurePayload) {
    const { questions, options } = this.normalizeStructureFromPayload(payload);
    const result = await this.replaceSurveyStructure(surveyId, questions, options);
    if (IS_DEV) {
      console.log('[AdminService] updateSurveyStructure 결과', { surveyId, result });
    }
    return result;
  }

  // 설문 구조 CSV 다운로드
  async exportSurveyToCsv(surveyId: number, res: Response) {
    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        questions: {
          orderBy: { id: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              include: {
                jumpTarget: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    if (!survey) {
      throw new NotFoundException('설문을 찾을 수 없습니다.');
    }

    const codeById = new Map<number, string>();
    survey.questions.forEach((question) => codeById.set(question.id, question.code));

    const surveysHeader = 'survey_code,title,description,is_active';
    const surveyLine = [
      `S${survey.id.toString().padStart(3, '0')}`,
      this.escapeCsv(survey.title),
      this.escapeCsv(survey.description ?? ''),
      survey.isActive ? '1' : '0',
    ].join(',');

    const questionsHeader = 'survey_code,question_code,type,text,next_question_code';
    const questionLines: string[] = [];
    for (const question of survey.questions) {
      questionLines.push(
        [
          `S${survey.id.toString().padStart(3, '0')}`,
          this.escapeCsv(question.code),
          question.type,
          this.escapeCsv(question.text),
          question.nextQuestionId ? codeById.get(question.nextQuestionId) ?? '' : '',
        ].join(','),
      );
    }

    const optionsHeader =
      'survey_code,question_code,value,label,order,is_other,jump_to_question_code';
    const optionLines: string[] = [];
    for (const question of survey.questions) {
      for (const option of question.options) {
        optionLines.push(
          [
            `S${survey.id.toString().padStart(3, '0')}`,
            this.escapeCsv(question.code),
            this.escapeCsv(option.value),
            this.escapeCsv(option.label),
            option.order,
            option.isOther ? '1' : '0',
            option.jumpTarget?.code ?? '',
          ].join(','),
        );
      }
    }

    const csv = [
      '[Surveys]',
      surveysHeader,
      surveyLine,
      '',
      '[Questions]',
      questionsHeader,
      ...questionLines,
      '',
      '[QuestionOptions]',
      optionsHeader,
      ...optionLines,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="survey-${surveyId}.csv"`);
    res.send(`\uFEFF${csv}`);

    if (IS_DEV) {
      console.log('[AdminService] exportSurveyToCsv 완료', { surveyId });
    }
  }

  // 엑셀 워크북 파싱
  private parseWorkbook(fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const questionsSheet =
      workbook.Sheets['Questions'] ??
      workbook.Sheets[workbook.SheetNames.find((name) => name.toLowerCase().includes('question')) ?? ''];
    const optionsSheet =
      workbook.Sheets['QuestionOptions'] ??
      workbook.Sheets[workbook.SheetNames.find((name) => name.toLowerCase().includes('option')) ?? ''];

    if (!questionsSheet) {
      throw new NotFoundException('엑셀에서 Questions 시트를 찾을 수 없습니다.');
    }

    const questionRows = XLSX.utils.sheet_to_json<QuestionRow>(questionsSheet, { defval: null });
    const optionRows = optionsSheet ? XLSX.utils.sheet_to_json<OptionRow>(optionsSheet, { defval: null }) : [];

    return { questionRows, optionRows };
  }

  // 엑셀 문항 행 정규화
  private normalizeQuestionsFromRows(questionRows: QuestionRow[]): NormalizedQuestion[] {
    if (!questionRows.length) {
      throw new BadRequestException('Questions data is empty');
    }

    const normalized: NormalizedQuestion[] = [];

    for (let index = 0; index < questionRows.length; index += 1) {
      const row = questionRows[index];
      const code = row.question_code?.toString().trim();
      if (!code) {
        throw new BadRequestException(`Questions[${index}]의 question_code가 비어 있습니다.`);
      }

      const type = (row.type ?? 'SINGLE').toString().trim().toUpperCase();
      const text = (row.text ?? '').toString();
      const rawNext = row.next_question_code?.toString().trim();
      const nextQuestionCode =
        rawNext && rawNext.toUpperCase() !== 'END' ? rawNext : null;

      normalized.push({
        code,
        type,
        text,
        nextQuestionCode,
      });
    }

    return normalized;
  }

  // 엑셀 선택지 행 정규화
  private normalizeOptionsFromRows(optionRows: OptionRow[]): NormalizedOption[] {
    const normalized: NormalizedOption[] = [];

    for (let index = 0; index < optionRows.length; index += 1) {
      const row = optionRows[index];
      const questionCode = row.question_code?.toString().trim();
      const value = row.value?.toString().trim() ?? '';

      if (!questionCode || !value) {
        continue;
      }

      const label = row.label?.toString() ?? '';
      const order =
        row.order !== undefined && Number.isFinite(Number(row.order))
          ? Number(row.order)
          : index;
      const isOther = this.normalizeBoolean(row.is_other);
      const rawJump = row.jump_to_question_code?.toString().trim();
      const jumpToCode =
        rawJump && rawJump.toUpperCase() !== 'END' ? rawJump : null;

      normalized.push({
        questionCode,
        value,
        label,
        order,
        isOther,
        jumpToCode,
      });
    }

    return normalized;
  }

  // UI 입력 구조 정규화
  private normalizeStructureFromPayload(payload: SurveyStructurePayload) {
    if (!payload?.questions?.length) {
      throw new BadRequestException('questions 목록이 비어 있습니다.');
    }

    const normalizedQuestions: NormalizedQuestion[] = [];
    const normalizedOptions: NormalizedOption[] = [];

    payload.questions.forEach((question, questionIndex) => {
      const code = question.code?.toString().trim();
      if (!code) {
        throw new BadRequestException(`questions[${questionIndex}]의 code가 비어 있습니다.`);
      }

      const type = (question.type ?? 'SINGLE').toString().trim().toUpperCase();
      const text = (question.text ?? '').toString();
      const rawNext = question.nextQuestionCode?.toString().trim();
      const nextQuestionCode =
        rawNext && rawNext.toUpperCase() !== 'END' ? rawNext : null;

      normalizedQuestions.push({
        code,
        type,
        text,
        nextQuestionCode,
      });

      (question.options ?? []).forEach((option, optionIndex) => {
        const value = option.value?.toString().trim() ?? '';
        if (!value) {
          return;
        }

        const label = option.label?.toString() ?? '';
        const order =
          option.order !== undefined && Number.isFinite(Number(option.order))
            ? Number(option.order)
            : optionIndex;
        const isOther = !!option.isOther;
        const rawJump = option.jumpToQuestionCode?.toString().trim();
        const jumpToCode =
          rawJump && rawJump.toUpperCase() !== 'END' ? rawJump : null;

        normalizedOptions.push({
          questionCode: code,
          value,
          label,
          order,
          isOther,
          jumpToCode,
        });
      });
    });

    return { questions: normalizedQuestions, options: normalizedOptions };
  }

  // 문자열 배열 JSON을 안전하게 파싱합니다.
  private parseOptionValuesJson(raw: string | null): string[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const values: string[] = [];
      for (const value of parsed) {
        const text = value?.toString();
        if (text) {
          values.push(text);
        }
      }
      return values;
    } catch (_error) {
      return [];
    }
  }

  // 응답 상태 계산용 다음 문항 코드를 도출합니다.
  private resolveNextQuestionCodeForStatus(
    question: StatusQuestion,
    answer: {
      optionValue?: string | number | null;
      optionValues?: Array<string | number>;
      otherText?: string | null;
    },
    findQuestionById: (id: number) => StatusQuestion | null,
  ): string | null {
    const normalizedType = question.type.toUpperCase();
    const selectedValues: string[] = [];

    if (normalizedType === 'SINGLE' && answer.optionValue != null) {
      selectedValues.push(answer.optionValue.toString());
    }

    if (normalizedType === 'MULTI' && answer.optionValues?.length) {
      for (const rawValue of answer.optionValues) {
        const text = rawValue?.toString();
        if (text) {
          selectedValues.push(text);
        }
      }
    }

    for (const value of selectedValues) {
      const matchedOption = question.options.find((option) => option.value === value);
      if (matchedOption?.jumpTarget?.code) {
        return matchedOption.jumpTarget.code;
      }
    }

    if (question.nextQuestionId) {
      const nextQuestion = findQuestionById(question.nextQuestionId);
      if (nextQuestion) {
        return nextQuestion.code;
      }
    }

    return null;
  }

  // 설문 전체 구조 교체
  private async replaceSurveyStructure(
    surveyId: number,
    questions: NormalizedQuestion[],
    options: NormalizedOption[],
  ) {
    if (!questions.length) {
      throw new BadRequestException('문항 데이터가 비어 있습니다.');
    }

    const questionCodeList: string[] = [];
    for (const question of questions) {
      questionCodeList.push(question.code);
    }

    this.ensureUnique(questionCodeList, 'question_code');

    const questionCodes = new Set(questionCodeList);
    options.forEach((option, index) => {
      if (!questionCodes.has(option.questionCode)) {
        throw new BadRequestException(
          `options[${index}]의 question_code "${option.questionCode}"가 문항 목록에 없습니다.`,
        );
      }
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.responseAnswer.deleteMany({
        where: { response: { surveyId } },
      });

      await tx.response.deleteMany({
        where: { surveyId },
      });

      await tx.questionOption.deleteMany({
        where: { question: { surveyId } },
      });

      await tx.question.deleteMany({
        where: { surveyId },
      });

      const questionIdByCode = new Map<string, number>();

      for (const question of questions) {
        const created = await tx.question.create({
          data: {
            surveyId,
            code: question.code,
            type: question.type,
            text: question.text,
          },
        });
        questionIdByCode.set(question.code, created.id);
      }

      for (const question of questions) {
        if (!question.nextQuestionCode) {
          continue;
        }

        const currentId = questionIdByCode.get(question.code);
        const targetId = questionIdByCode.get(question.nextQuestionCode);
        if (!targetId) {
          throw new BadRequestException(
            `"${question.code}"의 next_question_code "${question.nextQuestionCode}"를 찾을 수 없습니다.`,
          );
        }

        await tx.question.update({
          where: { id: currentId! },
          data: {
            nextQuestionId: targetId,
          },
        });
      }

      if (options.length) {
        const optionData: OptionInsertData[] = [];

        for (const option of options) {
          const questionId = questionIdByCode.get(option.questionCode);
          if (!questionId) {
            throw new BadRequestException(
              `선택지 ${option.value}의 question_code "${option.questionCode}"를 찾을 수 없습니다.`,
            );
          }

          let jumpToQuestionId: number | null = null;
          if (option.jumpToCode) {
            const targetId = questionIdByCode.get(option.jumpToCode);
            if (!targetId) {
              throw new BadRequestException(
                `"${option.questionCode}" 선택지 "${option.value}"의 jump_to_question_code "${option.jumpToCode}"를 찾을 수 없습니다.`,
              );
            }
            jumpToQuestionId = targetId;
          }

          optionData.push({
            questionId,
            value: option.value,
            label: option.label,
            order: option.order,
            isOther: option.isOther,
            jumpToQuestionId,
          });
        }

        await tx.questionOption.createMany({
          data: optionData,
        });
      }
    });

    return {
      questionsImported: questions.length,
      optionsImported: options.length,
    };
  }

  // 중복 값 검사
  private ensureUnique(values: string[], context: string) {
    const seen = new Set<string>();
    values.forEach((value) => {
      if (seen.has(value)) {
        throw new BadRequestException(`${context} "${value}"가 중복되었습니다.`);
      }
      seen.add(value);
    });
  }

  // 불리언 값 정규화
  private normalizeBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    if (typeof value === 'string') {
      return ['1', 'true', 'TRUE', 'yes', 'YES', 'y', 'Y'].includes(value.trim());
    }

    return false;
  }

  // CSV 특수문자 이스케이프
  private escapeCsv(value: string | null) {
    if (value == null) {
      return '';
    }

    const needsEscape = /[",\n]/.test(value);
    if (needsEscape) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }
}

