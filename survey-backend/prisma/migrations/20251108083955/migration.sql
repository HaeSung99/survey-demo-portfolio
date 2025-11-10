BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Survey] (
    [id] INT NOT NULL IDENTITY(1,1),
    [title] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(1000),
    [isActive] BIT NOT NULL CONSTRAINT [Survey_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Survey_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Survey_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Question] (
    [id] INT NOT NULL IDENTITY(1,1),
    [surveyId] INT NOT NULL,
    [code] NVARCHAR(50) NOT NULL,
    [type] NVARCHAR(20) NOT NULL,
    [text] NVARCHAR(1000) NOT NULL,
    [nextQuestionId] INT,
    CONSTRAINT [Question_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Question_surveyId_code_key] UNIQUE NONCLUSTERED ([surveyId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[Response] (
    [id] INT NOT NULL IDENTITY(1,1),
    [surveyId] INT NOT NULL,
    [sessionId] NVARCHAR(100),
    [respondent] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Response_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [resumeToken] NVARCHAR(100) NOT NULL,
    CONSTRAINT [Response_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Response_resumeToken_key] UNIQUE NONCLUSTERED ([resumeToken])
);

-- CreateTable
CREATE TABLE [dbo].[ResponseAnswer] (
    [id] INT NOT NULL IDENTITY(1,1),
    [responseId] INT NOT NULL,
    [questionId] INT NOT NULL,
    [optionValue] NVARCHAR(50),
    [optionValuesJson] NVARCHAR(4000),
    [otherText] NVARCHAR(4000),
    [answeredAt] DATETIME2 NOT NULL CONSTRAINT [ResponseAnswer_answeredAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ResponseAnswer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ResponseAnswer_responseId_questionId_key] UNIQUE NONCLUSTERED ([responseId],[questionId])
);

-- CreateTable
CREATE TABLE [dbo].[QuestionOption] (
    [id] INT NOT NULL IDENTITY(1,1),
    [questionId] INT NOT NULL,
    [value] NVARCHAR(50) NOT NULL,
    [label] NVARCHAR(200) NOT NULL,
    [option_order] INT NOT NULL CONSTRAINT [QuestionOption_option_order_df] DEFAULT 0,
    [isOther] BIT NOT NULL CONSTRAINT [QuestionOption_isOther_df] DEFAULT 0,
    [jumpToQuestionId] INT,
    CONSTRAINT [QuestionOption_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Survey_isActive_idx] ON [dbo].[Survey]([isActive]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Survey_title_idx] ON [dbo].[Survey]([title]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Question_surveyId_idx] ON [dbo].[Question]([surveyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Question_type_idx] ON [dbo].[Question]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Question_nextQuestionId_idx] ON [dbo].[Question]([nextQuestionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Response_surveyId_idx] ON [dbo].[Response]([surveyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Response_createdAt_idx] ON [dbo].[Response]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ResponseAnswer_responseId_idx] ON [dbo].[ResponseAnswer]([responseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ResponseAnswer_questionId_idx] ON [dbo].[ResponseAnswer]([questionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [QuestionOption_questionId_idx] ON [dbo].[QuestionOption]([questionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [QuestionOption_value_idx] ON [dbo].[QuestionOption]([value]);

-- AddForeignKey
ALTER TABLE [dbo].[Question] ADD CONSTRAINT [Question_surveyId_fkey] FOREIGN KEY ([surveyId]) REFERENCES [dbo].[Survey]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Response] ADD CONSTRAINT [Response_surveyId_fkey] FOREIGN KEY ([surveyId]) REFERENCES [dbo].[Survey]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ResponseAnswer] ADD CONSTRAINT [ResponseAnswer_responseId_fkey] FOREIGN KEY ([responseId]) REFERENCES [dbo].[Response]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ResponseAnswer] ADD CONSTRAINT [ResponseAnswer_questionId_fkey] FOREIGN KEY ([questionId]) REFERENCES [dbo].[Question]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[QuestionOption] ADD CONSTRAINT [QuestionOption_questionId_fkey] FOREIGN KEY ([questionId]) REFERENCES [dbo].[Question]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[QuestionOption] ADD CONSTRAINT [QuestionOption_jumpToQuestionId_fkey] FOREIGN KEY ([jumpToQuestionId]) REFERENCES [dbo].[Question]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
