import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../../core/auth/index.js';
import { AdminScriptDto, AdminUserDto, HideScriptDto } from './backoffice.dto.js';
import { BackofficeService } from './backoffice.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class BackofficeController {
  constructor(private readonly backoffice: BackofficeService) {}

  @Get('users')
  @ApiOperation({ summary: '사용자 목록 (관리자)' })
  @ApiOkResponse({ type: [AdminUserDto] })
  users() {
    return this.backoffice.users();
  }

  @Get('scripts')
  @ApiOperation({ summary: '공개·숨김 대본 목록 (관리자)' })
  @ApiOkResponse({ type: [AdminScriptDto] })
  scripts() {
    return this.backoffice.scripts();
  }

  @Patch('scripts/:id/hide')
  @ApiOperation({ summary: '대본 숨김 / 숨김 해제 (관리자)' })
  @ApiOkResponse({ type: AdminScriptDto })
  hide(@Param('id') id: string, @Body() dto: HideScriptDto) {
    return this.backoffice.hide(id, dto?.hidden ?? true);
  }
}
