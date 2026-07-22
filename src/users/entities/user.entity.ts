import { Exclude } from 'class-transformer';
import { UserRole } from 'generated/prisma/enums';

export class UserEntity {
  id!: string;
  email!: string;
  userRole!: UserRole;
  createdAt!: Date;
  updatedAt?: Date;

  @Exclude()
  passwordHash?: string;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
