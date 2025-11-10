import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

const APP_ENV = process.env.NODE_ENV ?? 'development';
const IS_DEV = APP_ENV !== 'production';

type QuestionOptionExtended = {
  value: string;
  jumpTarget: { id: number; code: string } | null;
};

type QuestionWithRelations = {
  id: number;
  code: string;
  type: string;
  nextQuestionId: number | null;
  options: QuestionOptionExtended[];
};

type AnswerPayload = {
  questionCode: string;
  optionValue?: string | number | null;
  optionValues?: Array<string | number>;
  otherText?: string | null;
};

type CreateResponsePayload = {
  sessionId?: string | null;
  respondent?: string | null;
  resumeToken?: string | null;
  answers: AnswerPayload[];
};

type SurveyWithQuestionRelations = {
  isActive: boolean;
  questions: QuestionWithRelations[];
};

type TransactionResponseResult = {
  resumeToken: string;
  response: {
    id: number;
    sessionId: string | null;
    respondent: string | null;
  };
};

type ResumeResponseRecord = {
  id: number;
  resumeToken: string;
  answers: Array<{
    optionValue: string | null;
    optionValuesJson: string | null;
    otherText: string | null;
    question: QuestionWithRelations;
  }>;
};

type HistoryRecord = {
  question: { code: string } | null;
  optionValue: string | null;
  optionValuesJson: string | null;
  otherText: string | null;
};

type HistoryItem = {
  questionCode: string;
  answer: {
    optionValue: string | null;
    optionValues: string[];
    otherText: string | null;
  };
};

@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

  // 활성 설문 목록 조회
  async listActiveSurveys() {
    const surveys = await this.prisma.survey.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (IS_DEV) {
      console.log('[SurveyService] listActiveSurveys 결과', surveys);
    }

    return surveys;
  }

  // 설문 상세 구조 조회
  async getSurveyDetail(surveyId: number) {
    const survey = (await this.prisma.survey.findUnique({
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
    })) as (SurveyWithQuestionRelations & Record<string, unknown>) | null;

    if (!survey) {
      throw new NotFoundException('설문을 찾을 수 없습니다.');
    }

    if (IS_DEV) {
      console.log('[SurveyService] getSurveyDetail 결과', survey);
    }

    return survey;
  }

  // 응답 저장 및 다음 문항 계산
  async createResponse(surveyId: number, payload: CreateResponsePayload) {
    if (!payload?.answers?.length) {
      throw new BadRequestException('answers 값이 필요합니다.');
    }

    const survey = (await this.prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        questions: {
          include: {
            options: {
              include: {
                jumpTarget: {
                  select: { id: true, code: true },
                },
              },
            },
          },
        },
      },
    })) as SurveyWithQuestionRelations | null;

    if (!survey) {
      throw new NotFoundException('설문을 찾을 수 없습니다.');
    }

    if (!survey.isActive) {
      throw new BadRequestException('비활성화된 설문입니다.');
    }

    const questionList: QuestionWithRelations[] = survey.questions;
    const findQuestionByCode = (code: string) => // 문항코드 기반
      questionList.find((question) => question.code === code) ?? null;
    const findQuestionById = (id: number) => // 문항ID 기반
      questionList.find((question) => question.id === id) ?? null;

    const transactionResult = (await this.prisma.$transaction(async (tx) => {
      const resumeToken = payload.resumeToken ?? randomUUID();
      const existingResponse = await tx.response.findFirst({
        where: { surveyId, resumeToken },
      });

      const response =
        existingResponse ??
        (await tx.response.create({
          data: {
            surveyId,
            sessionId: payload.sessionId ?? null,
            respondent: payload.respondent ?? null,
            resumeToken,
          },
        }));

      if (existingResponse) {
        await tx.response.update({
          where: { id: response.id },
          data: {
            sessionId: payload.sessionId ?? response.sessionId,
            respondent: payload.respondent ?? response.respondent,
          },
        });
      }

      for (const answer of payload.answers) {
        const targetQuestion = findQuestionByCode(answer.questionCode);

        if (!targetQuestion) {
          throw new BadRequestException(`알 수 없는 문항 코드입니다: ${answer.questionCode}`);
        }

        const optionValue = answer.optionValue?.toString() ?? null;
        let optionValuesList: string[] | undefined;
        if (Array.isArray(answer.optionValues)) {
          const parsedOptionValues: string[] = [];
          for (const rawValue of answer.optionValues) {
            const valueText = rawValue?.toString();
            if (valueText) {
              parsedOptionValues.push(valueText);
            }
          }
          optionValuesList = parsedOptionValues;
        }

        // 설문 답변 저장
        await tx.responseAnswer.upsert({
          where: {
            responseId_questionId: {
              responseId: response.id,
              questionId: targetQuestion.id,
            },
          },
          create: {
            responseId: response.id,
            questionId: targetQuestion.id,
            optionValue,
            optionValuesJson: optionValuesList?.length ? JSON.stringify(optionValuesList) : null,
            otherText: answer.otherText ?? null,
          },
          update: {
            optionValue,
            optionValuesJson: optionValuesList?.length ? JSON.stringify(optionValuesList) : null,
            otherText: answer.otherText ?? null,
            answeredAt: new Date(),
          },
        });
      }

      return { resumeToken, response };
    })) as TransactionResponseResult;

    const lastAnswer = payload.answers[payload.answers.length - 1];
    const lastQuestion = lastAnswer ? findQuestionByCode(lastAnswer.questionCode) : null;
    const nextQuestionCode = lastQuestion
      ? this.resolveNextQuestionCode(lastQuestion, lastAnswer, findQuestionById)
      : null;

    const result = {
      resumeToken: transactionResult.resumeToken,
      nextQuestionCode,
    };

    if (IS_DEV) {
      console.log('[SurveyService] createResponse 결과', result);
    }

    return result;
  }

  // 응답 재개 정보 조회
  async resumeResponse(surveyId: number, token: string) {
    const response = (await this.prisma.response.findFirst({
      where: {
        surveyId,
        resumeToken: token,
      },
      include: {
        answers: {
          orderBy: { answeredAt: 'desc' },
          take: 1,
          include: {
            question: {
              select: {
                id: true,
                code: true,
                type: true,
                nextQuestionId: true,
                options: {
                  include: {
                    jumpTarget: {
                      select: { id: true, code: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })) as ResumeResponseRecord | null;

    if (!response) {
      throw new NotFoundException('응답을 찾을 수 없습니다.');
    }

    const allQuestions = await this.prisma.question.findMany({
      where: { surveyId },
      select: {
        id: true,
        code: true,
        type: true,
        nextQuestionId: true,
      },
    });
    const questionList: QuestionWithRelations[] = [];
    for (const question of allQuestions) {
      questionList.push({ ...question, options: [] } as QuestionWithRelations);
    }
    const findQuestionById = (id: number) =>
      questionList.find((question) => question.id === id) ?? null;

    const lastAnswer = response.answers[0];
    const nextQuestionCode =
      lastAnswer && lastAnswer.question
        ? this.resolveNextQuestionCode(
            lastAnswer.question as QuestionWithRelations,
            {
              optionValue: lastAnswer.optionValue ?? undefined,
              optionValues: lastAnswer.optionValuesJson ? JSON.parse(lastAnswer.optionValuesJson) : undefined,
              otherText: lastAnswer.otherText ?? undefined,
            },
            findQuestionById,
          )
        : null;

    const historyRecords = (await this.prisma.responseAnswer.findMany({
      where: { responseId: response.id },
      orderBy: { answeredAt: 'asc' },
      include: {
        question: {
          select: { code: true },
        },
      },
    })) as HistoryRecord[];

    const history: HistoryItem[] = [];
    for (const record of historyRecords) {
      if (!record.question?.code) {
        continue;
      }

      let parsedValues: string[] = [];
      if (record.optionValuesJson) {
        try {
          const raw = JSON.parse(record.optionValuesJson);
          if (Array.isArray(raw)) {
            const collected: string[] = [];
            for (const rawValue of raw) {
              const valueText = rawValue?.toString();
              if (valueText) {
                collected.push(valueText);
              }
            }
            parsedValues = collected;
          }
        } catch (error) {
          parsedValues = [];
        }
      }

      history.push({
        questionCode: record.question.code,
        answer: {
          optionValue: record.optionValue,
          optionValues: parsedValues,
          otherText: record.otherText,
        },
      });
    }

    const result = {
      resumeToken: response.resumeToken,
      lastQuestionCode: history.length ? history[history.length - 1].questionCode : null,
      nextQuestionCode,
      history,
    };

    if (IS_DEV) {
      console.log('[SurveyService] resumeResponse 결과', result);
    }

    return result;
  }

  // 다음 문항 코드 계산
  private resolveNextQuestionCode(
    question: QuestionWithRelations,
    answer: Pick<AnswerPayload, 'optionValue' | 'optionValues' | 'otherText'>,
    findQuestionById: (id: number) => QuestionWithRelations | null,
  ): string | null {
    const normalizedType = question.type.toUpperCase();

    if (['SINGLE', 'MULTI'].includes(normalizedType)) {
      const selectedValues: string[] = [];

      if (normalizedType === 'SINGLE' && answer.optionValue) {
        selectedValues.push(answer.optionValue.toString());
      }

      if (normalizedType === 'MULTI' && answer.optionValues?.length) {
        for (const rawValue of answer.optionValues) {
          const valueText = rawValue?.toString();
          if (valueText) {
            selectedValues.push(valueText);
          }
        }
      }

      for (const value of selectedValues) {
        const matchedOption = question.options.find((option) => option.value === value);
        if (matchedOption?.jumpTarget?.code) {
          return matchedOption.jumpTarget.code;
        }
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
}

