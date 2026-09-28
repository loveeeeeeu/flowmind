import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { UpdateWorkflowDto } from './dto/update-workflow.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { QueryWorkflowDto } from './dto/query-workflow.dto.js';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateWorkflowDto) {
    return this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAll(query: QueryWorkflowDto) {
    const { page, pageSize, keyword } = query;
    const skip = (page - 1) * pageSize;
  
    const where: Prisma.WorkflowWhereInput = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { description: { contains: keyword, mode: 'insensitive' } },
          ],
        }
      : {};
  
    const [items, total] = await Promise.all([
      this.prisma.workflow.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workflow.count({ where }),
    ]);
  
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    await this.findOne(id);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.workflow.delete({
      where: { id },
    });
  }
}