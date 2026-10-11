import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';

@Module({ imports: [MembershipModule], controllers: [IdentityController], providers: [IdentityService] })
export class IdentityModule {}
