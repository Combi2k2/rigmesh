import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
        '^.+\\.jsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    },
    transformIgnorePatterns: [
        '/node_modules/(?!three)',
    ],
};

export default config;
