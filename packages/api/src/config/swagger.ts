import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Agentic Research Assistant API',
      version: '1.0.0',
      description: 'REST API for agentic research assistant with AI integration',
    },
    servers: [
      {
        url: 'http://localhost:3005',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API Key for authorization',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token for authentication',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
            },
            message: {
              type: 'string',
            },
            details: {
              type: 'object',
            },
          },
        },
        AuthUser: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
            },
            email: {
              type: 'string',
            },
            firstName: {
              type: 'string',
            },
            lastName: {
              type: 'string',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Authentication',
        description: 'User authentication endpoints (login/logout)',
      },
      {
        name: 'User',
        description: 'User management endpoints',
      },
      {
        name: 'Research',
        description: 'Research session and query endpoints',
      },
    ],
  },
  apis: ['./src/routes/*.routes.ts', './src/middleware/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
