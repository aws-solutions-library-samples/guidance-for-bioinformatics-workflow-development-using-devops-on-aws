params.outdir = 'results'

process FASTQC {
    tag "FASTQC on $sample_id"
    container '523155489867.dkr.ecr.us-west-2.amazonaws.com/rnaseq-nf:1.1.1'
    publishDir params.outdir, mode:'copy'

    input:
    path reads1
    path reads2
    val sample_id 

    output:
    path "fastqc_${sample_id}_logs" 

    script:
    """
    echo "Running fastqc"
    bash /usr/bin/fastqc.sh "$sample_id" "$reads1 $reads2"
    echo "Command done"
    ls -Rl && sleep 60
    """
}
