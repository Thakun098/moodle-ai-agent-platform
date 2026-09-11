import { describe, expect, it } from 'vitest';
import { validateStudentRiskResult } from '@moodle-agent-poc/contracts';
import { RiskEvidenceNormalizer, StudentRiskEvaluator } from '../src/index.js';
import { addCompetency, addProgressActivities, baseEvidence, STUDENT } from './course-evidence-fixture.js';

function resultFor(kind: 'LOW'|'MEDIUM'|'HIGH'|'INCOMPLETE') {
  const evidence=baseEvidence();
  if(kind==='LOW') addProgressActivities(evidence,10,10);
  if(kind==='MEDIUM') addProgressActivities(evidence,10,9);
  if(kind==='HIGH') addProgressActivities(evidence,4,3);
  if(kind==='INCOMPLETE') evidence.dataset_status=evidence.dataset_status.map(x=>x.dataset==='competencies'?{...x,status:'ERROR' as const,message:'fixture'}:x);
  if(kind==='MEDIUM') addCompetency(evidence,{competencyId:401,proficiency:false});
  const normalized=new RiskEvidenceNormalizer().normalizeStudent(evidence,STUDENT);
  return new StudentRiskEvaluator().evaluate(normalized);
}

describe('Ticket 08 StudentRiskResult v0.1 shared contract',()=>{
  it.each(['LOW','MEDIUM','HIGH','INCOMPLETE'] as const)('validates actual deterministic %s output',kind=>{
    const result=resultFor(kind);
    expect(validateStudentRiskResult(result)).toEqual({valid:true,errors:[]});
    if(kind==='INCOMPLETE') expect(result.overall_risk).toBeNull();
    else expect(result.overall_risk).not.toBeNull();
  });
  it('rejects an INCOMPLETE result that is incorrectly classified LOW',()=>{
    const result=resultFor('INCOMPLETE') as any;
    result.overall_risk='LOW';
    expect(validateStudentRiskResult(result).valid).toBe(false);
  });
});
