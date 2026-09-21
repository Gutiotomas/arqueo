import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: false, // el token viaja en la cabecera Authorization
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos que no estan en el DTO
      forbidNonWhitelisted: false,
      transform: true, // convierte "3" en 3 segun el tipo del DTO
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Arqueo API')
    .setDescription(
      'Ventas, gastos e inventario para pequeños negocios. Los importes viajan como string para no perder precision.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swagger),
    { jsonDocumentUrl: 'docs/json' },
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API escuchando en http://localhost:${port}/api/v1`);
  logger.log(`Documentacion en http://localhost:${port}/docs`);
}

void bootstrap();
