import { IsIn } from 'class-validator';
import { SCHEDULED_DELAY_OPTIONS } from '@gitroom/helpers/utils/scheduled.delay';

export class DefaultDelayDto {
  @IsIn(SCHEDULED_DELAY_OPTIONS.map(({ value }) => value))
  defaultDelay: number;
}
